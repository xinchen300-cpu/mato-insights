"use server";

import { revalidatePath } from "next/cache";
import { getRefillSheetByToken } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { lineKey } from "@/lib/refill";
import type { RefillLine } from "@/lib/types";

// Public: authorised by the unguessable share token, not by a login.
/**
 * Opening the sheet starts the clock and brings the list up to date: what sold
 * while the run was being prepared is already off the list again. Only while
 * the run is open — a closed run keeps the lines it was closed with.
 */
/**
 * Opening the sheet starts the clock, and nothing else. It used to refresh the
 * lines here too, but the page re-renders on every request, so that threw away
 * the freeze on everything the filler had already ticked and packed. The list
 * is brought up to date by the sheet itself, which knows what is in the box.
 */
export async function startRun(token: string) {
  await createAdminClient().rpc("start_run", { sheet_token: token });
}

/**
 * The shop keeps selling while the filler is at the fridge or in the van, so
 * the list on their phone would slowly stop matching the machine. Asking again
 * costs one query and keeps the sheet honest: what sold in the meantime is
 * simply on the list again.
 *
 * What the filler already ticked is left exactly as it was. Those pieces are
 * in the cool box; raising their number would ask for stock that is not in the
 * van, and dropping the line would mean the refill is never written down.
 */
export async function refreshLines(token: string, packed: string[] = []): Promise<RefillLine[] | null> {
  return recompute(token, packed);
}

async function recompute(token: string, packed: string[]): Promise<RefillLine[] | null> {
  const admin = createAdminClient();
  const { data: sheet } = await admin
    .from("refill_sheets")
    .select("id, org_id, machine_ids, lines, completed_at")
    .eq("share_token", token)
    .maybeSingle();
  if (!sheet || sheet.completed_at) return null;

  const { data: fresh } = await admin.rpc("refill_plan", {
    target_org: sheet.org_id,
    machine_filter: sheet.machine_ids,
  });
  if (!fresh) return null;

  const frozen = new Set(packed.slice(0, 500));
  const kept = ((sheet.lines ?? []) as RefillLine[]).filter((line) => frozen.has(lineKey(line)));
  const lines = [...kept, ...(fresh as RefillLine[]).filter((line) => !frozen.has(lineKey(line)))].sort(
    (a, b) =>
      a.machine_name.localeCompare(b.machine_name) ||
      a.row_position - b.row_position ||
      a.slot_position - b.slot_position,
  );

  // A run that was completed while this was being worked out keeps the lines
  // it was closed with.
  await admin.from("refill_sheets").update({ lines }).eq("id", sheet.id).is("completed_at", null);
  return lines;
}

/** What the filler has put in the cool box so far, kept on the run itself. */
export async function saveBox(token: string, box: Record<string, number>) {
  const clean = Object.fromEntries(
    Object.entries(box).filter(([, v]) => Number.isInteger(v) && v > 0 && v <= 999),
  );
  await createAdminClient()
    .from("refill_sheets")
    .update({ box: clean })
    .eq("share_token", token)
    .is("completed_at", null);
}

export async function completeSheet(
  token: string,
  adjustments: Record<string, number>,
  expiries: Record<string, string> = {},
  filler = "",
  checks: Record<string, boolean> = {},
  km: number | null = null,
  shortages: { product_id: string | null; qty: number }[] = [],
  expiryChecked = false,
) {
  const sheet = await getRefillSheetByToken(token);
  if (!sheet) return { status: "not_found" as const };
  if (sheet.completed_at) return { status: "already_done" as const };

  const clean = Object.fromEntries(
    Object.entries(adjustments).filter(([, v]) => Number.isInteger(v) && v >= 0 && v <= 999),
  );

  const dates = Object.fromEntries(
    Object.entries(expiries).filter(([, v]) => /^\d{4}-\d{2}-\d{2}$/.test(v)),
  );

  const ticked = Object.fromEntries(Object.entries(checks).filter(([, v]) => v === true));

  const { error } = await createAdminClient().rpc("complete_refill_sheet", {
    sheet_token: token,
    adjustments: clean,
    expiries: dates,
    filler_name: filler.trim().slice(0, 80),
    check_state: ticked,
    driven_km: Number.isFinite(km) && (km as number) >= 0 ? km : null,
    shortages: shortages.filter((s) => Number.isInteger(s.qty) && s.qty > 0 && s.qty <= 999),
    expiry_checked: expiryChecked,
  });
  if (error) {
    return { status: error.message.includes("already completed") ? ("already_done" as const) : ("error" as const) };
  }

  revalidatePath("/", "layout");
  return { status: "done" as const };
}
