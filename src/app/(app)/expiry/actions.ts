"use server";

import { revalidatePath } from "next/cache";
import { getExpiryAlerts, getMachineStock, requireMachineAccess } from "@/lib/data";
import { requireOrgId } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Take the over-date units out of a slot: a correction down to what is left,
 * noted as waste. The oldest stock is the stock that goes, so the expired units
 * are exactly the ones removed.
 */
export async function pullExpired(machineId: string, selection: string, qty: number) {
  const orgId = await requireOrgId();
  await requireMachineAccess(orgId, machineId);
  if (!Number.isInteger(qty) || qty <= 0) throw new Error("Nothing to pull");

  // The page may have stood open for hours, and the oldest pieces sell first,
  // so some of what was over date has since been bought. Take today's number,
  // never the one the screen remembers, or good stock disappears with it.
  const alert = (await getExpiryAlerts(orgId)).find(
    (a) => a.machine_id === machineId && a.selection_number === selection,
  );
  const expired = Math.min(qty, alert?.qty_expired ?? 0);
  if (expired <= 0) {
    revalidatePath("/", "layout");
    return;
  }

  const slots = await getMachineStock(orgId, [machineId]);
  const slot = slots.find((s) => s.selection_number === selection);
  if (!slot || slot.stock === null) throw new Error("Slot not counted");

  const { error } = await createAdminClient().rpc("record_stock", {
    target_org: orgId,
    target_machine: machineId,
    event_type: "correction",
    entries: [{ selection, level_after: Math.max(slot.stock - expired, 0) }],
    note: "expired",
  });
  if (error) throw new Error(error.message);

  revalidatePath("/", "layout");
}
