import { createAdminClient } from "@/lib/supabase/admin";
import { planAllows, planById, type Feature, type Plan } from "@/lib/plans";

/**
 * "ended" is a trial that is over with nothing charging: not "active", because
 * nobody is paying, and showing a green badge there would be a lie.
 */
export type BillingStatus = "none" | "trial" | "active" | "ended" | "cancelled";

export type Billing = {
  plan: Plan | null;
  status: BillingStatus;
  trialEndsAt: string | null;
  cancelledAt: string | null;
  isVendor: boolean;
  hasMandate: boolean;
  subscriptionId: string | null;
  customerId: string | null;
  billingEmail: string | null;
};

/**
 * Charging stays off in code, whatever the environment says, until each of
 * these exists. The review of 04-10-2026 found every one missing, and any one
 * of them missing means a charge someone was not properly told about:
 *
 * - a mail provider, and no Mollie subscription before the 7-day notice mail
 *   has actually gone out (create it from vendly-billing, not the webhook);
 * - one place that says Mollie is on, read by both the app and vendly-billing;
 * - a confirmation mail after signup (Visa: within 2 working days; Mastercard);
 * - a receipt after every charge, and handling of failed and charged-back
 *   payments;
 * - an invoice for every charge: Peppol e-invoices are required for Belgian
 *   B2B since 1-1-2026, and MATO OS cannot send them yet;
 * - written terms and the seller's identity on the confirm screen;
 * - the same confirm screen before payment details are added in Settings,
 *   before a package change, and before a cancelled account resumes.
 *
 * Until then the trial runs without payment details, and the screens say so.
 */
const PAYMENTS_READY = false;

export function paymentsEnabled(): boolean {
  return PAYMENTS_READY && Boolean(process.env.MOLLIE_API_KEY);
}

export async function getBilling(orgId: string): Promise<Billing> {
  const { data: org } = await createAdminClient()
    .from("organizations")
    .select(
      "plan, trial_ends_at, cancelled_at, is_vendor, billing_email, mollie_customer_id, mollie_mandate_id, mollie_subscription_id",
    )
    .eq("id", orgId)
    .maybeSingle();

  const plan = planById(org?.plan as string | null);
  const trialEndsAt = (org?.trial_ends_at as string | null) ?? null;
  const cancelledAt = (org?.cancelled_at as string | null) ?? null;

  let status: BillingStatus = "none";
  if (plan && cancelledAt) status = "cancelled";
  else if (plan && trialEndsAt && new Date(trialEndsAt) > new Date()) status = "trial";
  else if (plan && paymentsEnabled() && org?.mollie_subscription_id) status = "active";
  else if (plan) status = "ended";

  return {
    plan,
    status,
    trialEndsAt,
    cancelledAt,
    isVendor: Boolean(org?.is_vendor),
    hasMandate: Boolean(org?.mollie_mandate_id),
    subscriptionId: (org?.mollie_subscription_id as string | null) ?? null,
    customerId: (org?.mollie_customer_id as string | null) ?? null,
    billingEmail: (org?.billing_email as string | null) ?? null,
  };
}

/**
 * Whether this organisation's package includes a feature. The vendor sells
 * the app and pays for nothing; an account without a package keeps what it
 * had. Called from the few actions that start something a package decides —
 * never from a loader.
 */
export async function featureAllowed(orgId: string, feature: Feature): Promise<boolean> {
  const billing = await getBilling(orgId);
  if (billing.isVendor) return true;
  return planAllows(billing.plan, feature);
}

/** Machines the operator has claimed: the number a package is measured against. */
export async function linkedMachineCount(orgId: string): Promise<number> {
  const { count } = await createAdminClient()
    .from("machines")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("excluded", false);
  return count ?? 0;
}
