import { fmt, type Formatters } from "@/i18n/format";
import type { Messages } from "@/i18n/messages";
import { NOTICE_DAYS, SUPPORT_PHONE, TRIAL_DAYS, planFor, priceInclVat, type Plan } from "@/lib/plans";

const DAY = 24 * 60 * 60 * 1000;

/**
 * When a trial that starts now ends, when the first charge can land, and the
 * day we mail about it. The charge is the end of the trial, unless that is
 * closer than the notice period (someone confirming late): then it moves out,
 * the same way ensureSubscription moves it, so the screen never promises a
 * date the subscription will not keep.
 */
export function trialDates(trialEndsAt: Date | string | null, now = new Date()) {
  const end = trialEndsAt ? new Date(trialEndsAt) : new Date(now.getTime() + TRIAL_DAYS * DAY);
  const earliest = new Date(now.getTime() + NOTICE_DAYS * DAY);
  const charge = end > earliest ? end : earliest;
  return { end, charge, notice: new Date(charge.getTime() - NOTICE_DAYS * DAY) };
}

/**
 * The terms as they stand on the confirm screen, one sentence per line. Built
 * from the same function on the client (to show) and on the server (to store
 * next to the click), so what we can prove someone saw is what they saw.
 */
export function disclosureLines(
  m: Messages,
  f: Formatters,
  plan: Plan,
  trialEndsAt: Date,
  payments: boolean,
): string[] {
  const { charge, notice } = trialDates(trialEndsAt);
  const name = m.plans[plan.id];
  if (!payments) {
    return [fmt(m.billing.noPayments, { date: f.date(trialEndsAt), plan: name })];
  }
  return [
    m.billing.todayPay,
    fmt(m.billing.trialUntil, { date: f.date(trialEndsAt) }),
    fmt(m.billing.thenStarts, {
      plan: name,
      incl: f.euro(priceInclVat(plan)),
      excl: f.euro(plan.pricePerMonth),
      date: f.date(charge),
    }),
    fmt(m.billing.reminder, { date: f.date(notice) }),
    // The path is built from the real menu names, so it can never point at a
    // screen that is called something else in that language.
    fmt(m.billing.cancelAnytime, { settings: m.settings.title, billing: m.billing.title }),
  ];
}

/** The checkbox sentence; stored with the lines above. */
export function acceptLine(m: Messages, f: Formatters, plan: Plan): string {
  return fmt(m.billing.accept, { plan: m.plans[plan.id], incl: f.euro(priceInclVat(plan)) });
}

export type FeatureLine = { text: string; soon?: boolean };

/**
 * What a package card lists: its machines, then only what it adds to the one
 * below it. Lines for things that do not exist yet say so — the app does not
 * sell a feature it cannot show.
 */
export function planFeatureLines(m: Messages, plan: Plan, plans: Plan[]): FeatureLine[] {
  const index = plans.findIndex((p) => p.id === plan.id);
  const below = index > 0 ? plans[index - 1] : null;
  const lines: FeatureLine[] = [
    { text: plan.maxMachines === 1 ? m.billing.machinesOne : fmt(m.billing.machinesUpTo, { count: plan.maxMachines }) },
  ];
  if (below) lines.push({ text: fmt(m.billing.featureAllOf, { plan: m.plans[below.id] }) });
  else lines.push({ text: m.billing.featureBasics }, { text: m.billing.featureEvening });

  const added = plan.features.filter((feature) => !below?.features.includes(feature));
  if (added.includes("refill")) lines.push({ text: m.billing.featureRefill });
  if (added.includes("shareWithShops")) lines.push({ text: m.billing.featureShare });
  if (added.includes("phoneSupport")) {
    lines.push(SUPPORT_PHONE ? { text: m.billing.featurePhone } : { text: m.billing.soonPhone, soon: true });
  }
  if (added.includes("rentalStatement")) lines.push({ text: m.billing.soonRental, soon: true });
  lines.push({ text: fmt(m.billing.soonAi, { count: plan.aiQuestions }), soon: true });
  return lines;
}

/**
 * What a package change says before it is confirmed, and what is stored after:
 * the same sentence, built by the same function on both sides.
 */
export function planChangeLine(m: Messages, f: Formatters, plan: Plan): string {
  return fmt(m.billing.changeConfirm, {
    plan: m.plans[plan.id],
    excl: f.euro(plan.pricePerMonth),
    incl: f.euro(priceInclVat(plan)),
  });
}

/**
 * The line that says linking these machines moves the package up, or null
 * when it does not. Shown wherever machines are ticked (the wizard, the
 * terminals page) before saving, and stored as what was shown after.
 */
export function upgradeLine(
  m: Messages,
  f: Formatters,
  current: Plan | null,
  machines: number,
  payments: boolean,
): string | null {
  if (!current || machines <= current.maxMachines) return null;
  const next = planFor(machines);
  if (next.id === current.id) return null;
  const line = fmt(m.billing.upgraded, {
    count: machines,
    plan: m.plans[next.id],
    excl: f.euro(next.pricePerMonth),
    incl: f.euro(priceInclVat(next)),
  });
  return payments ? `${line} ${m.billing.upgradedMail}` : line;
}
