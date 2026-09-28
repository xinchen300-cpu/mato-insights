"use server";

import { revalidatePath } from "next/cache";
import { getRefillSheetByToken } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";

// Public: authorised by the unguessable share token, not by a login.
/** The filler opening the sheet starts the clock, once. */
export async function startRun(token: string) {
  await createAdminClient().rpc("start_run", { sheet_token: token });
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
