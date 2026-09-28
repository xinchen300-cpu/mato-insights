"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrgId } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RefillLine } from "@/lib/types";

export async function createRefillSheet(machineIds: string[]): Promise<{ empty: true } | void> {
  const orgId = await requireOrgId();
  if (machineIds.length === 0) return { empty: true };
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
  await createAdminClient()
    .from("refill_sheets")
    .update({ notes: notes.trim() || null })
    .eq("id", sheetId)
    .eq("org_id", orgId);
  revalidatePath(`/refill/${sheetId}`);
}
