/**
 * The few Mollie calls the subscription needs, against the v2 REST API.
 * Docs: https://docs.mollie.com/docs/recurring-payments
 *
 * How it fits together:
 * 1. At signup a "first" payment of € 0,02 (Bancontact's minimum) creates a
 *    mandate: Bancontact, KBC and Belfius turn into a SEPA direct debit
 *    mandate, a card into a card mandate.
 * 2. The webhook sees that payment paid and starts a subscription on the
 *    mandate whose first charge is the day the trial ends.
 * 3. A change of package patches the subscription amount; cancelling deletes
 *    the subscription. Mollie charges a fixed amount, so packages fit it.
 *
 * Mollie sends no pre-notification of its own: the mail seven days ahead is
 * ours (supabase/functions/vendly-billing).
 */
const API = "https://api.mollie.com/v2";

export const FIRST_PAYMENT_EUR = "0.02";

function key(): string {
  const value = process.env.MOLLIE_API_KEY;
  if (!value) throw new Error("MOLLIE_API_KEY is not set");
  return value;
}

/** Mollie wants amounts as strings with exactly two decimals. */
export function mollieAmount(eur: number): { currency: "EUR"; value: string } {
  return { currency: "EUR", value: eur.toFixed(2) };
}

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  if (response.status === 204) return undefined as T;
  const json = (await response.json().catch(() => ({}))) as T & { detail?: string; title?: string };
  if (!response.ok) throw new Error(`Mollie ${response.status}: ${json.detail ?? json.title ?? "error"}`);
  return json;
}

export async function createCustomer(name: string, email: string | null, orgId: string): Promise<string> {
  const customer = await call<{ id: string }>("/customers", {
    method: "POST",
    body: { name, email: email ?? undefined, metadata: { orgId } },
  });
  return customer.id;
}

export type MolliePayment = {
  id: string;
  status: "open" | "canceled" | "pending" | "authorized" | "expired" | "failed" | "paid";
  sequenceType: "oneoff" | "first" | "recurring";
  amount: { value: string; currency: string };
  customerId?: string;
  mandateId?: string;
  subscriptionId?: string;
  metadata?: { orgId?: string } | null;
  _links?: { checkout?: { href: string } };
};

export async function createFirstPayment(args: {
  customerId: string;
  orgId: string;
  description: string;
  redirectUrl: string;
  webhookUrl: string;
}): Promise<{ id: string; checkoutUrl: string }> {
  const payment = await call<MolliePayment>("/payments", {
    method: "POST",
    body: {
      amount: { currency: "EUR", value: FIRST_PAYMENT_EUR },
      customerId: args.customerId,
      sequenceType: "first",
      description: args.description,
      redirectUrl: args.redirectUrl,
      webhookUrl: args.webhookUrl,
      metadata: { orgId: args.orgId },
    },
  });
  const checkoutUrl = payment._links?.checkout?.href;
  if (!checkoutUrl) throw new Error("Mollie gave no checkout link");
  return { id: payment.id, checkoutUrl };
}

export function getPayment(id: string): Promise<MolliePayment> {
  return call<MolliePayment>(`/payments/${encodeURIComponent(id)}`);
}

export async function createSubscription(args: {
  customerId: string;
  mandateId: string;
  amountEur: number;
  startDate: string;
  description: string;
  webhookUrl: string;
  orgId: string;
}): Promise<string> {
  const subscription = await call<{ id: string }>(`/customers/${encodeURIComponent(args.customerId)}/subscriptions`, {
    method: "POST",
    body: {
      amount: mollieAmount(args.amountEur),
      interval: "1 month",
      startDate: args.startDate,
      // Mollie wants the description unique per customer; the start date makes it so.
      description: args.description,
      mandateId: args.mandateId,
      webhookUrl: args.webhookUrl,
      metadata: { orgId: args.orgId },
    },
  });
  return subscription.id;
}

export async function updateSubscriptionAmount(customerId: string, subscriptionId: string, amountEur: number) {
  await call(`/customers/${encodeURIComponent(customerId)}/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "PATCH",
    body: { amount: mollieAmount(amountEur) },
  });
}

export async function cancelSubscription(customerId: string, subscriptionId: string) {
  await call(`/customers/${encodeURIComponent(customerId)}/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "DELETE",
  });
}
