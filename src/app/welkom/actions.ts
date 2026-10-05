"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getI18n } from "@/i18n/server";
import { requireOperator, requireOrgId } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { listPayterTerminals, triggerPayterSync, type PayterTerminal } from "@/lib/sync";
import { getBilling, linkedMachineCount, paymentsEnabled } from "@/lib/billing";
import { acceptLine, disclosureLines, trialDates } from "@/lib/billing-copy";
import { planById, planFits, priceInclVat } from "@/lib/plans";
import { startMandateCheckout } from "@/lib/subscription";

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

export type StartTrialResult =
  | { ok: true; checkoutUrl: string | null }
  | { ok: false; reason: "plan" | "tooSmall" | "notAccepted" | "vendor" | "payment" };

/**
 * Start the trial on a package. The terms are rebuilt here from the same
 * function the screen used and stored next to the click, because if anyone
 * ever asks what this customer agreed to, the answer has to be on record.
 * A trial starts once: choosing again keeps the original end date.
 */
export async function startTrial(planId: string, accepted: boolean): Promise<StartTrialResult> {
  const orgId = await requireOrgId();
  await requireOperator();

  const plan = planById(planId);
  if (!plan) return { ok: false, reason: "plan" };
  const billing = await getBilling(orgId);
  if (billing.isVendor) return { ok: false, reason: "vendor" };
  // The package has to carry what is already linked; the client is not trusted on that.
  if (!planFits(plan, await linkedMachineCount(orgId))) return { ok: false, reason: "tooSmall" };

  const payments = paymentsEnabled();
  if (payments && !accepted) return { ok: false, reason: "notAccepted" };

  const { end } = trialDates(billing.trialEndsAt);
  const { m, f } = await getI18n();
  const lines = disclosureLines(m, f, plan, end, payments);
  if (payments) lines.push(acceptLine(m, f, plan));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({
      plan: plan.id,
      plan_chosen_at: new Date().toISOString(),
      trial_ends_at: end.toISOString(),
      cancelled_at: null,
      billing_email: billing.billingEmail ?? user?.email ?? null,
    })
    .eq("id", orgId);
  // No proof of agreement for a package that was never set.
  if (error) return { ok: false, reason: "plan" };

  await admin.from("billing_consents").insert({
    org_id: orgId,
    user_id: user?.id ?? null,
    email: user?.email ?? null,
    plan: plan.id,
    price_excl: plan.pricePerMonth,
    price_incl: priceInclVat(plan),
    trial_ends_at: end.toISOString(),
    payments,
    text_shown: lines.join("\n"),
    user_agent: (await headers()).get("user-agent")?.slice(0, 300) ?? null,
  });

  revalidatePath("/", "layout");

  if (!payments || billing.hasMandate) return { ok: true, checkoutUrl: null };
  try {
    return { ok: true, checkoutUrl: await startMandateCheckout(orgId, "/welkom?betaald=1") };
  } catch {
    return { ok: false, reason: "payment" };
  }
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
