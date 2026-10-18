import { headers } from "next/headers";
import { DISPLAY_TIME_ZONE } from "@/i18n/format";
import { getBilling, paymentsEnabled } from "@/lib/billing";
import { createCustomer, createFirstPayment, createSubscription } from "@/lib/mollie";
import { NOTICE_DAYS, priceInclVat } from "@/lib/plans";
import { createAdminClient } from "@/lib/supabase/admin";

const DAY = 24 * 60 * 60 * 1000;

/** Where Mollie sends people back and posts its webhook. */
export async function appOrigin(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const host = (await headers()).get("host") ?? "";
  const local = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  return `${local ? "http" : "https"}://${host}`;
}

/** A calendar day in Brussels, as Mollie wants a start date: YYYY-MM-DD. */
export function brusselsDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: DISPLAY_TIME_ZONE }).format(date);
}

/**
 * Send the customer to Mollie to give a mandate. Returns the checkout link.
 * The payment itself is € 0,02; what it is for is the mandate it leaves.
 */
export async function startMandateCheckout(orgId: string, returnPath: string): Promise<string> {
  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("name, billing_email, mollie_customer_id")
    .eq("id", orgId)
    .single();
  if (!org) throw new Error("Unknown organisation");

  let customerId = org.mollie_customer_id as string | null;
  if (!customerId) {
    customerId = await createCustomer(org.name as string, org.billing_email as string | null, orgId);
    await admin.from("organizations").update({ mollie_customer_id: customerId }).eq("id", orgId);
  }

  const origin = await appOrigin();
  const payment = await createFirstPayment({
    customerId,
    orgId,
    description: "MATO Info: betaalgegevens bevestigen",
    redirectUrl: `${origin}${returnPath}`,
    webhookUrl: `${origin}/api/mollie/webhook`,
  });
  await admin.from("billing_payments").upsert({
    mollie_id: payment.id,
    org_id: orgId,
    sequence: "first",
    amount: 0.02,
    status: "open",
  });
  return payment.checkoutUrl;
}

/**
 * Start the subscription once there is a mandate, a package and no
 * cancellation. The first charge is the day the trial ends, or — when the
 * mandate came late — far enough ahead that the seven-day notice still fits.
 * Safe to call more than once: it does nothing when a subscription exists.
 */
export async function ensureSubscription(orgId: string, origin: string): Promise<void> {
  if (!paymentsEnabled()) return;
  const billing = await getBilling(orgId);
  if (!billing.plan || billing.cancelledAt || billing.subscriptionId) return;
  if (!billing.customerId || !billing.hasMandate) return;

  const { data: org } = await createAdminClient()
    .from("organizations")
    .select("mollie_mandate_id")
    .eq("id", orgId)
    .single();
  if (!org?.mollie_mandate_id) return;

  const earliest = new Date(Date.now() + NOTICE_DAYS * DAY);
  const trialEnd = billing.trialEndsAt ? new Date(billing.trialEndsAt) : earliest;
  const firstCharge = trialEnd > earliest ? trialEnd : earliest;
  const startDate = brusselsDay(firstCharge);

  const subscriptionId = await createSubscription({
    customerId: billing.customerId,
    mandateId: org.mollie_mandate_id as string,
    amountEur: priceInclVat(billing.plan),
    startDate,
    description: `MATO Info vanaf ${startDate}`,
    webhookUrl: `${origin}/api/mollie/webhook`,
    orgId,
  });

  await createAdminClient()
    .from("organizations")
    .update({ mollie_subscription_id: subscriptionId, first_charge_on: startDate })
    .eq("id", orgId);
}
