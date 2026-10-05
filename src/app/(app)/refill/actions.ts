"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperator, requireOrgId } from "@/lib/org";
import { requireMachineAccess } from "@/lib/data";
import { featureAllowed } from "@/lib/billing";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RefillLine } from "@/lib/types";

export async function createRefillSheet(
  machineIds: string[],
): Promise<{ empty: true } | { locked: true } | void> {
  const orgId = await requireOrgId();
  // A run carries every slot of every machine on it, including a co-tenant's
  // on a shared machine: planning one is the operator's job, never a shop's.
  await requireOperator();
  // Refill runs start at Zaak; a Solo account sees the note, not an error.
  if (!(await featureAllowed(orgId, "refill"))) return { locked: true };
  if (machineIds.length === 0) return { empty: true };
  // The list comes from a checkbox on a page, so it comes from the client:
  // asking for a machine that is not yours must not put it on your sheet.
  for (const machineId of machineIds) await requireMachineAccess(orgId, machineId);
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("refill_plan", { target_org: orgId, machine_filter: machineIds });
  if (error) throw new Error(error.message);
  const lines = (data ?? []) as RefillLine[];
  if (lines.length === 0) return { empty: true };

  const { data: sheet, error: insertError } = await admin
    .from("refill_sheets")
    .insert({
      org_id: orgId,
      share_token: randomBytes(18).toString("base64url"),
      machine_ids: machineIds,
      lines,
    })
    .select("id")
    .single();
  if (insertError) throw new Error(insertError.message);

  revalidatePath("/refill");
  redirect(`/refill/${sheet.id}`);
}

export async function saveSheetNotes(sheetId: string, notes: string) {
  const orgId = await requireOrgId();
  // The notes belong to the run, and the run is the operator's.
  await requireOperator();
  await createAdminClient()
    .from("refill_sheets")
    .update({ notes: notes.trim() || null })
    .eq("id", sheetId)
    .eq("org_id", orgId);
  revalidatePath(`/refill/${sheetId}`);
}
