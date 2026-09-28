"use server";

import { revalidatePath } from "next/cache";
import { getMachineStock } from "@/lib/data";
import { requireOrgId } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Take the over-date units out of a slot: a correction down to what is left,
 * noted as waste. The oldest stock is the stock that goes, so the expired units
 * are exactly the ones removed.
 */
export async function pullExpired(machineId: string, selection: string, qty: number) {
  const orgId = await requireOrgId();
  if (!Number.isInteger(qty) || qty <= 0) throw new Error("Nothing to pull");

  const slots = await getMachineStock(orgId, [machineId]);
  const slot = slots.find((s) => s.selection_number === selection);
  if (!slot || slot.stock === null) throw new Error("Slot not counted");

  const { error } = await createAdminClient().rpc("record_stock", {
    target_org: orgId,
    target_machine: machineId,
    event_type: "correction",
    entries: [{ selection, level_after: Math.max(slot.stock - qty, 0) }],
    note: "expired",
  });
  if (error) throw new Error(error.message);

  revalidatePath("/", "layout");
}
