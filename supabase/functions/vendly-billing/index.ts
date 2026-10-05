// The billing mails the rules require, once a day.
//
// 1. Seven days before the first charge after a trial: the amount and the
//    date. Visa wants at least 7 days before that charge, Mastercard 3 to 7
//    days before the trial ends, SEPA a pre-notification: this one mail is all
//    three. Cancelled accounts get nothing; nothing will be charged.
// 2. When a running Mollie subscription must change amount (a bigger or
//    smaller package): a mail with the new amount and the date at least seven
//    days ahead, and only then the amount is changed at Mollie. No mail out,
//    no change: the old amount is charged once more rather than one nobody
//    announced.
//
// Hard prerequisite before Mollie goes live: a mail provider (resend_api_key
// and mail_from in app_keys). Without one, step 1 records "skipped" and a
// subscription created at signup would still charge on its start date with no
// mail before it. Mollie is switched on after mail works, never before.
//
// Every attempt is a row in billing_notices, sent or not — that is the log the
// card schemes ask a merchant to be able to show. Amounts come from the
// customer's own consent rows, so this function never keeps a price list of
// its own that could drift from src/lib/plans.ts.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const NOTICE_DAYS = 7;
const PLAN_NAMES: Record<string, string> = { solo: "Solo", zaak: "Zaak", automatenshop: "Automatenshop" };

const brusselsDay = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(date);
const dayNumber = (day: string) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / 86_400_000;
const longDate = (day: string) =>
  new Intl.DateTimeFormat("nl-BE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${day}T12:00:00Z`),
  );
const euro = (value: number) => new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(value);

type Org = {
  id: string;
  name: string;
  plan: string;
  trial_ends_at: string | null;
  first_charge_on: string | null;
  billing_email: string | null;
  mollie_customer_id: string | null;
  mollie_mandate_id: string | null;
  mollie_subscription_id: string | null;
};

Deno.serve(async (req) => {
  const db = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: keys } = await db.from("app_keys").select("name, value");
  const key = (name: string) => keys?.find((k) => k.name === name)?.value ?? "";

  // Called by pg_cron with the shared secret; nothing else gets in.
  const given = req.headers.get("x-notify-secret") ?? "";
  if (!key("notify_secret") || given !== key("notify_secret")) return new Response("forbidden", { status: 403 });

  const dryRun = new URL(req.url).searchParams.get("dry") === "1";
  const appUrl = (key("app_url") || "https://vendly-six-gold.vercel.app").replace(/\/$/, "");
  const cancelLink = `${appUrl}/settings#abonnement`;
  const mollieKey = key("mollie_api_key");
  const today = brusselsDay(new Date());
  const results: Record<string, unknown>[] = [];

  async function send(to: string | null, subject: string, text: string): Promise<{ status: string; detail: string }> {
    if (!to) return { status: "failed", detail: "no billing email" };
    if (!key("resend_api_key") || !key("mail_from")) return { status: "skipped_no_provider", detail: "no mail provider" };
    if (dryRun) return { status: "skipped_no_provider", detail: "dry run" };
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key("resend_api_key")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: key("mail_from"), to: [to], subject, text }),
    });
    return response.ok
      ? { status: "sent", detail: `resend ${response.status}` }
      : { status: "failed", detail: `resend ${response.status}: ${(await response.text()).slice(0, 200)}` };
  }

  async function alreadySent(orgId: string, kind: string, dueOn: string) {
    const { data } = await db
      .from("billing_notices")
      .select("status")
      .eq("org_id", orgId)
      .eq("kind", kind)
      .eq("due_on", dueOn)
      .maybeSingle();
    return data?.status === "sent";
  }

  async function record(orgId: string, kind: string, dueOn: string, plan: string, amount: number, to: string | null, outcome: { status: string; detail: string }) {
    if (dryRun) return;
    await db.from("billing_notices").upsert(
      { org_id: orgId, kind, due_on: dueOn, plan, amount_incl: amount, recipient: to, status: outcome.status, detail: outcome.detail },
      { onConflict: "org_id,kind,due_on" },
    );
  }

  /** What this customer agreed to pay for their current package. */
  async function agreedPrice(orgId: string, plan: string) {
    const { data } = await db
      .from("billing_consents")
      .select("price_excl, price_incl")
      .eq("org_id", orgId)
      .eq("plan", plan)
      .order("accepted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ? { excl: Number(data.price_excl), incl: Number(data.price_incl) } : null;
  }

  const { data: orgs } = await db
    .from("organizations")
    .select(
      "id, name, plan, trial_ends_at, first_charge_on, billing_email, mollie_customer_id, mollie_mandate_id, mollie_subscription_id",
    )
    .eq("is_vendor", false)
    .is("cancelled_at", null)
    .not("plan", "is", null);

  for (const org of (orgs ?? []) as Org[]) {
    const price = await agreedPrice(org.id, org.plan);
    if (!price) continue;
    const name = PLAN_NAMES[org.plan] ?? org.plan;

    // 1. The trial is ending.
    const chargeDay = org.first_charge_on ?? (org.trial_ends_at ? brusselsDay(new Date(org.trial_ends_at)) : null);
    if (chargeDay) {
      const daysLeft = dayNumber(chargeDay) - dayNumber(today);
      if (daysLeft >= 0 && daysLeft <= NOTICE_DAYS && !(await alreadySent(org.id, "trial_ending", chargeDay))) {
        const withMandate = Boolean(mollieKey && org.mollie_mandate_id);
        const subject = `Je proef van MATO Insights loopt af op ${longDate(chargeDay)}`;
        const body = withMandate
          ? [
              `Dag ${org.name},`,
              ``,
              `Je gratis proef van MATO Insights loopt af. Op ${longDate(chargeDay)} start je pakket ${name}: ` +
                `we schrijven dan ${euro(price.incl)} af (${euro(price.excl)} excl. btw), en daarna elke maand op dezelfde dag hetzelfde bedrag.`,
              ``,
              `Wil je niet verder? Zeg dan vóór ${longDate(chargeDay)} op, dan betaal je niets: ${cancelLink}`,
            ]
          : [
              `Dag ${org.name},`,
              ``,
              `Je gratis proef van MATO Insights loopt af op ${longDate(chargeDay)}. Daarna kost ${name} ` +
                `${euro(price.excl)} per maand excl. btw (${euro(price.incl)} incl. btw).`,
              ``,
              mollieKey
                ? `Je hebt nog geen betaalgegevens gegeven. Wil je verder, voeg ze dan toe: ${cancelLink}`
                : `Hoe je daarna verdergaat, laten we je persoonlijk weten. Wil je niet verder, zeg dan hier op: ${cancelLink}`,
            ];
        const outcome = await send(org.billing_email, subject, body.join("\n"));
        await record(org.id, "trial_ending", chargeDay, org.plan, price.incl, org.billing_email, outcome);
        results.push({ org: org.name, kind: "trial_ending", due: chargeDay, ...outcome });
      }
    }

    // 2. A running subscription whose amount no longer matches the package.
    if (!mollieKey || !org.mollie_customer_id || !org.mollie_subscription_id) continue;
    const subscriptionUrl = `https://api.mollie.com/v2/customers/${org.mollie_customer_id}/subscriptions/${org.mollie_subscription_id}`;
    const response = await fetch(subscriptionUrl, { headers: { Authorization: `Bearer ${mollieKey}` } });
    if (!response.ok) continue;
    const subscription = (await response.json()) as { status: string; amount: { value: string }; nextPaymentDate?: string };
    if (subscription.status !== "active" || !subscription.nextPaymentDate) continue;
    if (Math.abs(Number(subscription.amount.value) - price.incl) < 0.005) continue;

    const next = subscription.nextPaymentDate;
    // Too close to the next charge to announce it properly: wait until after it.
    if (dayNumber(next) - dayNumber(today) < NOTICE_DAYS) continue;
    if (await alreadySent(org.id, "plan_change", next)) continue;

    const outcome = await send(
      org.billing_email,
      `Je nieuwe bedrag voor MATO Insights vanaf ${longDate(next)}`,
      [
        `Dag ${org.name},`,
        ``,
        `Je pakket is nu ${name}. Vanaf ${longDate(next)} schrijven we ${euro(price.incl)} af ` +
          `(${euro(price.excl)} excl. btw), en daarna elke maand op dezelfde dag hetzelfde bedrag.`,
        ``,
        `Opzeggen of een ander pakket kiezen kan altijd hier: ${cancelLink}`,
      ].join("\n"),
    );
    await record(org.id, "plan_change", next, org.plan, price.incl, org.billing_email, outcome);
    if (outcome.status === "sent") {
      await fetch(subscriptionUrl, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${mollieKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: { currency: "EUR", value: price.incl.toFixed(2) } }),
      });
    }
    results.push({ org: org.name, kind: "plan_change", due: next, ...outcome });
  }

  return new Response(JSON.stringify({ today, dryRun, results }), { headers: { "Content-Type": "application/json" } });
});
