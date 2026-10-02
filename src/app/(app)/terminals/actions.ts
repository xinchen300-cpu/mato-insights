"use server";

import { revalidatePath } from "next/cache";
import { requireOperator, requireOrgId } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";

export type TerminalChoice = { serial: string; mine: boolean; name: string };

/**
 * Which terminals on the Payter account are this operator's, and what each is
 * called. A terminal left unticked keeps `excluded`, so its sales never enter
 * the figures — that is how one login can carry another business's machines
 * without mixing them in.
 */
export async function saveTerminalChoices(choices: TerminalChoice[]) {
  const orgId = await requireOrgId();
  // Which machines exist at all is the operator's call, never a shop's.
  await requireOperator();
  const admin = createAdminClient();

  for (const choice of choices.slice(0, 200)) {
    const serial = String(choice.serial ?? "").trim();
    if (!serial) continue;
    const name = String(choice.name ?? "").trim().slice(0, 80) || serial;

    const { data: existing } = await admin
      .from("machines")
      .select("id")
      .eq("org_id", orgId)
      .eq("payter_serial_number", serial)
      .maybeSingle();

    if (existing) {
      await admin
        .from("machines")
        .update({ name, excluded: !choice.mine })
        .eq("id", existing.id)
        .eq("org_id", orgId);
    } else if (choice.mine) {
      // Only something you claimed is worth a row of its own.
      await admin
        .from("machines")
        .insert({ org_id: orgId, name, payter_serial_number: serial, excluded: false });
    }
  }

  revalidatePath("/", "layout");
}
