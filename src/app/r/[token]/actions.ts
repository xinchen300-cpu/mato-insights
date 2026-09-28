"use server";

import { revalidatePath } from "next/cache";
import { getRefillSheetByToken } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";

// Public: authorised by the unguessable share token, not by a login.
export async function completeSheet(
  token: string,
  adjustments: Record<string, number>,
  expiries: Record<string, string> = {},
  filler = "",
  checks: Record<string, boolean> = {},
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
  });
  if (error) {
    return { status: error.message.includes("already completed") ? ("already_done" as const) : ("error" as const) };
  }

  revalidatePath("/", "layout");
  return { status: "done" as const };
}
