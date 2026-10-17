/**
 * De pakketten zoals ze op het keuzescherm, in Instellingen en op de
 * klantenpagina staan.
 *
 * ── DIT IS HET BESTAND DAT JE AANPAST ──────────────────────────────────────
 * Prijzen, grenzen en wat erin zit staan hier en nergens anders. Verander een
 * getal hieronder en de wizard, het abonnementsblok en de mails volgen.
 * Beslist met Xin op 04-10-2026: Solo € 19, Zaak € 49, Automatenshop € 99.
 * Verhuren aan zaken (een automaat opsplitsen, zaken laten meekijken) zit
 * sinds 17-10-2026 alleen in Automatenshop: een zaak verhuurt niets.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * One rule that keeps this app from turning into Televend: a package never
 * appears in a loader. What you see is what your scope allows, full stop. The
 * package is checked in exactly these places: linking machines (it may move
 * you up), starting a refill run, switching on a shop's share link, and —
 * once they exist — an AI question and the rental statement.
 */
export type PlanId = "solo" | "zaak" | "automatenshop";

/** shareWithShops: renting machines or slots to businesses, who look along at their own sales. */
export type Feature = "refill" | "shareWithShops" | "phoneSupport" | "rentalStatement";

export type Plan = {
  id: PlanId;
  /** Euro per maand, exclusief btw. */
  pricePerMonth: number;
  /** Tot hoeveel automaten. Meer dan het grootste pakket is een prijs op maat. */
  maxMachines: number;
  /** Vragen aan je eigen cijfers per maand, zodra die functie bestaat. */
  aiQuestions: number;
  features: Feature[];
  /** Eén pakket mag vooraan staan; meer dan één en het helpt niemand. */
  featured?: boolean;
};

export const PLANS: Plan[] = [
  { id: "solo", pricePerMonth: 19, maxMachines: 1, aiQuestions: 50, features: [] },
  {
    id: "zaak",
    pricePerMonth: 49,
    maxMachines: 5,
    aiQuestions: 150,
    features: ["refill"],
    featured: true,
  },
  {
    id: "automatenshop",
    pricePerMonth: 99,
    maxMachines: 15,
    aiQuestions: 400,
    features: ["refill", "shareWithShops", "phoneSupport", "rentalStatement"],
  },
];

/**
 * Het nummer voor telefonische hulp in Automatenshop. Zolang het hier leeg is,
 * staat de hulp als "binnenkort" op de kaart: een kanaal beloven dat niemand
 * kan bellen is erger dan het nog niet beloven. Vul het in en de kaart en het
 * abonnementsblok tonen het.
 */
export const SUPPORT_PHONE: string | null = null;

/** Gratis proef, in dagen. Daarna start het gekozen pakket vanzelf. */
export const TRIAL_DAYS = 60;

/**
 * How many days before a charge the customer must hear the amount and the
 * date. Visa wants at least 7 days before the first charge after a trial,
 * Mastercard 3 to 7 days before the trial ends, SEPA a pre-notification before
 * every collection: one mail 7 days ahead satisfies all three.
 */
export const NOTICE_DAYS = 7;

/** Belgische btw. Mollie schrijft het bedrag inclusief btw af. */
export const VAT_RATE = 0.21;

export function priceInclVat(plan: Plan): number {
  return Math.round(plan.pricePerMonth * (1 + VAT_RATE) * 100) / 100;
}

/** The biggest package that is not a price on request. */
export const LARGEST_PLAN = PLANS[PLANS.length - 1];

/**
 * The smallest package that carries this many machines. Above the largest it
 * returns the largest, and `needsQuote` says a price on request is due.
 */
export function planFor(machines: number): Plan {
  return PLANS.find((p) => machines <= p.maxMachines) ?? LARGEST_PLAN;
}

export function needsQuote(machines: number): boolean {
  return machines > LARGEST_PLAN.maxMachines;
}

export function planById(id: string | null | undefined): Plan | null {
  return PLANS.find((p) => p.id === id) ?? null;
}

/** A package may be chosen when it carries the machines already linked. */
export function planFits(plan: Plan, machines: number): boolean {
  return machines <= plan.maxMachines || plan.id === LARGEST_PLAN.id;
}

/**
 * Whether a package includes a feature. No package at all means an account
 * from before packages existed (or the vendor itself): nothing is taken away
 * from it, because nobody agreed to less.
 */
export function planAllows(plan: Plan | null, feature: Feature): boolean {
  return plan === null || plan.features.includes(feature);
}

/** The cheapest package that has a feature, for the line that says where it lives. */
export function cheapestWith(feature: Feature): Plan {
  return PLANS.find((p) => p.features.includes(feature)) ?? LARGEST_PLAN;
}
