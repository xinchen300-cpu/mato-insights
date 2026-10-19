// Whether a machine is worth its visit today (Xin, 19-10-2026: the driver
// costs €16 an hour and spends about 15 minutes at a machine). Leaving it out
// saves that visit and the detour to it; it costs what the machine fails to
// sell until the next round because a slot ran empty. A machine is only left
// out when that is clearly less, when what is in it and what it sells are
// known, and when nothing in it runs past its date before the next visit.
// Pure logic, checked by npm run test:flow.

import { hourShares, nextFill, salesBetween, slotPace, type WeekdaySales } from "@/lib/production";
import { DEPOT, legKey } from "@/lib/round-settings";
import { DISPERSION, MIN_SALES } from "@/lib/stats";

/** Minutes at one machine (Xin, 19-10-2026). */
export const VISIT_MINUTES = 15;

/**
 * Pieces a slot holding `stock` fails to sell when `mean` are asked for, on
 * average: what is asked beyond the stock. Sales spread DISPERSION times wider
 * than Poisson, as a negative binomial with that mean and variance.
 */
export function expectedShort(mean: number, stock: number): number {
  if (mean <= 0) return 0;
  const p = 1 / DISPERSION;
  const r = mean / (DISPERSION - 1);
  // E[max(0, D − s)] = mean − Σ_{k<s} P(D > k).
  let pk = Math.pow(p, r);
  let below = 0;
  let sold = 0;
  for (let k = 0; k < Math.max(0, Math.floor(stock)); k++) {
    below += pk;
    sold += 1 - below;
    pk *= ((k + r) / (k + 1)) * (1 - p);
  }
  return Math.max(0, mean - sold);
}

export type SkipSlot = { selection: string; capacity: number; stock: number | null; price: number | null };
export type SkipMachine = {
  id: string;
  /** Its sales come in as they happen, from a payment terminal; not typed in a day later. */
  live: boolean;
  slots: SkipSlot[];
  /** Pieces to take out before the next visit, and pieces whose label has to be read. */
  pull: number;
  check: number;
};
export type SkipInput = {
  now: Date;
  /** The machines the round would visit, in the order of the route. */
  machines: SkipMachine[];
  sales: WeekdaySales[];
  hourUnits: { hour: number; units: number }[];
  /** Kilometres and minutes between stops, keyed by legKey. */
  legs: Record<string, number>;
  drive: Record<string, number>;
  perHour: number;
  perKm: number;
};

/**
 * Why a machine is visited anyway, or "skip". notLive: its sales come in late,
 * so what is in it now is not known; uncounted: a slot was never counted;
 * tooFew: under MIN_SALES sales to know its pace; noPrice: no price to weigh;
 * dates: something comes out or needs its label read; worth: the visit pays.
 */
export type SkipReason = "notLive" | "uncounted" | "tooFew" | "noPrice" | "dates" | "worth" | "skip";
export type SkipAdvice = {
  machineId: string;
  reason: SkipReason;
  /** Pieces it is expected to fail to sell until the next round, when left out. */
  missed: number;
  /** Those pieces at their price: the most leaving it out can cost (the margin is not known). */
  lost: number;
  /** What its visit costs: the minutes there and the detour, and the kilometres of the detour. */
  saves: number;
  minutes: number;
  km: number;
};

/** The extra minutes and kilometres a machine adds to a route; an unknown leg counts as none. */
function detour(route: string[], id: string, legs: Record<string, number>, drive: Record<string, number>) {
  const at = route.indexOf(id);
  const prev = route[at - 1] ?? DEPOT;
  const next = route[at + 1] ?? DEPOT;
  // Two machines at one place (0 km) are no drive apart, also without minutes set.
  const minutes = (a: string, b: string) => drive[legKey(a, b)] ?? (legs[legKey(a, b)] === 0 ? 0 : undefined);
  const km = (a: string, b: string) => legs[legKey(a, b)];
  const extra = (between: (a: string, b: string) => number | undefined) => {
    const there = between(prev, id);
    const on = between(id, next);
    const direct = prev === next ? 0 : between(prev, next);
    return there === undefined || on === undefined || direct === undefined ? 0 : Math.max(0, there + on - direct);
  };
  return { minutes: extra(minutes), km: extra(km) };
}

export function skipAdvice(input: SkipInput): SkipAdvice[] {
  const { now } = input;
  const until = nextFill(now);
  const pace = slotPace(input.sales, now);
  const shares = hourShares(input.hourUnits);
  const sold = new Map<string, number>();
  for (const row of input.sales) sold.set(row.machineId, (sold.get(row.machineId) ?? 0) + row.units);

  const advice = input.machines.map((machine): SkipAdvice => {
    const prices = machine.slots.flatMap((slot) => (slot.price && slot.price > 0 ? [slot.price] : []));
    const usual = prices.length > 0 ? prices.reduce((sum, p) => sum + p, 0) / prices.length : null;
    let missed = 0;
    let lost = 0;
    for (const slot of machine.slots) {
      if (slot.stock === null) continue;
      const asked = salesBetween(pace.get(`${machine.id}|${slot.selection}`) ?? [], shares, now, until);
      // What a visit now would have sold that a slot left as it is will not.
      const short = expectedShort(asked, slot.stock) - expectedShort(asked, slot.capacity);
      missed += short;
      lost += short * (slot.price && slot.price > 0 ? slot.price : (usual ?? 0));
    }
    const reason: SkipReason = !machine.live
      ? "notLive"
      : machine.slots.some((slot) => slot.stock === null)
        ? "uncounted"
        : (sold.get(machine.id) ?? 0) < MIN_SALES
          ? "tooFew"
          : machine.pull > 0 || machine.check > 0
            ? "dates"
            : usual === null
              ? "noPrice"
              : "worth";
    return { machineId: machine.id, reason, missed, lost, saves: 0, minutes: 0, km: 0 };
  });

  // The visit that saves most over what it costs goes first; then the route is
  // looked at again without it, since two machines at one place only save the
  // drive there when both are left out.
  let route = input.machines.map((machine) => machine.id);
  const costOf = (id: string) => {
    const { minutes, km } = detour(route, id, input.legs, input.drive);
    return { minutes, km, saves: ((VISIT_MINUTES + minutes) / 60) * input.perHour + km * input.perKm };
  };
  for (;;) {
    let best: { entry: SkipAdvice; net: number; cost: ReturnType<typeof costOf> } | null = null;
    for (const entry of advice) {
      if (entry.reason !== "worth") continue;
      const cost = costOf(entry.machineId);
      const net = cost.saves - entry.lost;
      if (net > 0 && (best === null || net > best.net)) best = { entry, net, cost };
    }
    if (best === null) break;
    const left = best.entry.machineId;
    Object.assign(best.entry, { reason: "skip", ...best.cost });
    route = route.filter((id) => id !== left);
  }
  // What each visit still made costs, on the route as it ends up.
  for (const entry of advice) if (entry.reason !== "skip" && route.includes(entry.machineId)) Object.assign(entry, costOf(entry.machineId));
  return advice;
}
