/**
 * De pakketten zoals ze op het keuzescherm staan.
 *
 * ── DIT IS HET BESTAND DAT JE AANPAST ──────────────────────────────────────
 * Prijzen, grenzen en namen staan hier en nergens anders. Verander een getal
 * hieronder en het scherm, de vergelijking en de bevestiging volgen vanzelf.
 *
 * De bedragen hieronder zijn een voorstel, geen beslissing: ze gaan uit van
 * een operator die een paar automaten draait en geen telemetriebox van €450
 * per automaat wil kopen. Zet ze op wat jij wil vragen.
 * ───────────────────────────────────────────────────────────────────────────
 */
export type Plan = {
  id: "start" | "groei" | "onbeperkt";
  /** Euro per maand, exclusief btw. */
  pricePerMonth: number;
  /** Tot hoeveel automaten, of null voor onbeperkt. */
  maxMachines: number | null;
  /** Eén pakket mag vooraan staan; meer dan één en het helpt niemand. */
  featured?: boolean;
};

export const PLANS: Plan[] = [
  { id: "start", pricePerMonth: 29, maxMachines: 3 },
  { id: "groei", pricePerMonth: 69, maxMachines: 10, featured: true },
  { id: "onbeperkt", pricePerMonth: 149, maxMachines: null },
];

/** Het kleinste pakket dat dit aantal automaten aankan. */
export function planFor(machines: number): Plan {
  return PLANS.find((p) => p.maxMachines === null || machines <= p.maxMachines) ?? PLANS[PLANS.length - 1];
}

export function planById(id: string | null | undefined): Plan | null {
  return PLANS.find((p) => p.id === id) ?? null;
}
