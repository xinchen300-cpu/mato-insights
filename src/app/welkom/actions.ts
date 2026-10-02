"use server";

import { revalidatePath } from "next/cache";
import { requireOperator, requireOrgId } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";
import { listPayterTerminals, triggerPayterSync, type PayterTerminal } from "@/lib/sync";
import { planById } from "@/lib/plans";

/**
 * Ask Payter for the terminals on the account. Called from the wizard while
 * the operator waits, so the first sync is already on its way: without it the
 * list would stay empty until the five-minute cron came round.
 */
export async function fetchTerminals(): Promise<PayterTerminal[]> {
  const orgId = await requireOrgId();
  await requireOperator();
  const terminals = await listPayterTerminals(orgId);
  // Sales can start arriving while the operator is still naming machines.
  void triggerPayterSync(orgId).catch(() => {});
  return terminals;
}

export async function choosePlan(planId: string) {
  const orgId = await requireOrgId();
  await requireOperator();
  const plan = planById(planId);
  if (!plan) throw new Error("Unknown plan");

  await createAdminClient()
    .from("organizations")
    .update({ plan: plan.id, plan_chosen_at: new Date().toISOString() })
    .eq("id", orgId);
  revalidatePath("/", "layout");
}

/** The tour is behind them, whether they walked it or waved it off. */
export async function finishOnboarding() {
  const orgId = await requireOrgId();
  await requireOperator();
  await createAdminClient()
    .from("organizations")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("id", orgId);
  revalidatePath("/", "layout");
}
