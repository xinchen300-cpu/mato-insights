"use server";

import { revalidatePath } from "next/cache";
import { getI18n } from "@/i18n/server";
import { getBilling, linkedMachineCount, paymentsEnabled } from "@/lib/billing";
import { cancelSubscription as cancelMollieSubscription } from "@/lib/mollie";
import { hasPersonalSettings, requireOperator, requireOrgId } from "@/lib/org";
import { planById, planFits, priceInclVat } from "@/lib/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { planChangeLine } from "@/lib/billing-copy";
import { appOrigin, ensureSubscription, startMandateCheckout } from "@/lib/subscription";

/** Who the subscription belongs to: the operator of a paying organisation. */
async function requireSubscriber() {
  const orgId = await requireOrgId();
  await requireOperator();
  const billing = await getBilling(orgId);
  if (billing.isVendor) throw new Error("The vendor has no subscription");
  return { orgId, billing };
}

async function recordConsent(orgId: string, planId: string, text: string) {
  const plan = planById(planId);
  if (!plan) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const billing = await getBilling(orgId);
  await createAdminClient().from("billing_consents").insert({
    org_id: orgId,
    user_id: user?.id ?? null,
    email: user?.email ?? null,
    plan: plan.id,
    price_excl: plan.pricePerMonth,
    price_incl: priceInclVat(plan),
    trial_ends_at: billing.trialEndsAt,
    payments: paymentsEnabled(),
    text_shown: text,
  });
}

/**
 * Move to another package. Only one that carries the machines already linked:
 * going smaller means unlinking first, so nobody pays Solo for five machines.
 */
export async function changePlan(planId: string): Promise<{ ok: boolean }> {
  const { orgId } = await requireSubscriber();
  const plan = planById(planId);
  if (!plan || !planFits(plan, await linkedMachineCount(orgId))) return { ok: false };

  const { error } = await createAdminClient()
    .from("organizations")
    .update({ plan: plan.id, plan_chosen_at: new Date().toISOString() })
    .eq("id", orgId);
  if (error) return { ok: false };

  const { m, f } = await getI18n();
  await recordConsent(orgId, plan.id, planChangeLine(m, f, plan));

  // A running Mollie subscription keeps its amount until the mail that
  // announces the new one has gone out, seven days ahead (vendly-billing).
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Online, at any time, one click and a confirmation: what Visa and Mastercard require. */
export async function cancelSubscription(): Promise<void> {
  const { orgId, billing } = await requireSubscriber();
  if (paymentsEnabled() && billing.customerId && billing.subscriptionId) {
    await cancelMollieSubscription(billing.customerId, billing.subscriptionId);
  }
  await createAdminClient()
    .from("organizations")
    .update({ cancelled_at: new Date().toISOString(), mollie_subscription_id: null })
    .eq("id", orgId);
  revalidatePath("/", "layout");
}

/**
 * Undo a cancellation. With a mandate on file the subscription starts again,
 * never sooner than the notice period allows.
 */
export async function resumeSubscription(): Promise<void> {
  const { orgId } = await requireSubscriber();
  await createAdminClient().from("organizations").update({ cancelled_at: null }).eq("id", orgId);
  await ensureSubscription(orgId, await appOrigin());
  revalidatePath("/", "layout");
}

/** Send the customer to Mollie to give (or replace) payment details. */
export async function addPaymentDetails(): Promise<{ checkoutUrl: string | null }> {
  const { orgId } = await requireSubscriber();
  if (!paymentsEnabled()) return { checkoutUrl: null };
  // Abonnement is in Profiel where one's own settings are on (24-10-2026).
  const back = (await hasPersonalSettings()) ? "/profile" : "/settings";
  return { checkoutUrl: await startMandateCheckout(orgId, `${back}?betaald=1#abonnement`) };
}
