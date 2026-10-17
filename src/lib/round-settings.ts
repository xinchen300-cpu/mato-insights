/** How the operator wants a refill round to go, set on the Werkwijze page. */
export type RoundSettings = {
  /** Extra things to look at by every machine, ticked off like the slots. */
  checks: string[];
  /** A short message at the top of every round. */
  message: string | null;
  /** May a machine be skipped ("Overslaan")? */
  allowSkip: boolean;
  /** When the operator's phone hears about a round. */
  notify: { start: boolean; eachMachine: boolean; finish: boolean };
  /**
   * The route: machine ids in the order the owner wants them visited. Set when
   * a round is made, and every next round follows it.
   */
  route: string[];
  /**
   * Kilometres between two stops, the same both ways, keyed by legKey: from
   * the depot to a machine, or between two machines. What a round drove is
   * added up from these, never asked of the filler.
   */
  legs: Record<string, number>;
};

export const MAX_CHECKS = 8;
export const MAX_CHECK_LENGTH = 60;
export const MAX_MESSAGE_LENGTH = 280;
export const MAX_ROUTE = 200;
export const MAX_LEGS = 500;
/** Where a round leaves from and comes back to. */
export const DEPOT = "depot";
const MACHINE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DEFAULT_ROUND_SETTINGS: RoundSettings = {
  checks: [],
  message: null,
  allowSkip: true,
  notify: { start: true, eachMachine: false, finish: true },
  route: [],
  legs: {},
};

/**
 * Whatever is stored or sent, made safe: unknown keys dropped, text trimmed
 * and capped, a check named twice kept once, and the defaults where nothing
 * was chosen. Settings saved before a new option existed keep working.
 */
export function cleanRoundSettings(raw: unknown): RoundSettings {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const notify = (value.notify && typeof value.notify === "object" ? value.notify : {}) as Record<string, unknown>;
  const flag = (given: unknown, fallback: boolean) => (typeof given === "boolean" ? given : fallback);
  const seen = new Set<string>();
  const checks: string[] = [];
  for (const entry of Array.isArray(value.checks) ? value.checks : []) {
    if (typeof entry !== "string") continue;
    const label = entry.replace(/\s+/g, " ").trim().slice(0, MAX_CHECK_LENGTH);
    const key = label.toLocaleLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    checks.push(label);
    if (checks.length === MAX_CHECKS) break;
  }
  const message = typeof value.message === "string" ? value.message.trim().slice(0, MAX_MESSAGE_LENGTH) : "";
  return {
    checks,
    message: message || null,
    allowSkip: flag(value.allowSkip, DEFAULT_ROUND_SETTINGS.allowSkip),
    notify: {
      start: flag(notify.start, DEFAULT_ROUND_SETTINGS.notify.start),
      eachMachine: flag(notify.eachMachine, DEFAULT_ROUND_SETTINGS.notify.eachMachine),
      finish: flag(notify.finish, DEFAULT_ROUND_SETTINGS.notify.finish),
    },
    route: [...new Set((Array.isArray(value.route) ? value.route : []).filter((id): id is string => typeof id === "string" && MACHINE_ID.test(id)))].slice(0, MAX_ROUTE),
    legs: cleanLegs(value.legs),
  };
}

/** One key per pair of stops, whichever way round: the depot or a machine on either end. */
export function legKey(from: string, to: string): string {
  const a = from === "start" || from === "end" ? DEPOT : from;
  const b = to === "start" || to === "end" ? DEPOT : to;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

const isStop = (end: string) => end === DEPOT || MACHINE_ID.test(end);

/** Distances as stored or sent, made safe: known pairs only, 0.1 to 1000 km, to one decimal. */
function cleanLegs(raw: unknown): Record<string, number> {
  const legs: Record<string, number> = {};
  if (!raw || typeof raw !== "object") return legs;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const ends = key.split("|");
    const km = typeof value === "number" ? Math.round(value * 10) / 10 : NaN;
    if (ends.length !== 2 || ends[0] === ends[1] || !ends.every(isStop) || !(km > 0 && km <= 1000)) continue;
    legs[legKey(ends[0], ends[1])] = km;
    if (Object.keys(legs).length === MAX_LEGS) break;
  }
  return legs;
}

/**
 * The kilometres of a round driven in this order: from the depot, past every
 * machine, and back. Null when one of those legs has no distance yet: a sum
 * with a hole in it is no distance.
 */
export function routeKm(order: string[], legs: Record<string, number>): number | null {
  if (order.length === 0) return null;
  const stops = [DEPOT, ...order, DEPOT];
  let total = 0;
  for (let i = 1; i < stops.length; i++) {
    const km = legs[legKey(stops[i - 1], stops[i])];
    if (km === undefined) return null;
    total += km;
  }
  return Math.round(total * 10) / 10;
}

/**
 * Machines in the order of the route; those not on it yet keep their own
 * order, after the rest.
 */
export function orderByRoute(ids: string[], route: string[]): string[] {
  const place = new Map(route.map((id, index) => [id, index]));
  return [...ids]
    .map((id, index) => ({ id, index }))
    .sort((a, b) => (place.get(a.id) ?? route.length + a.index) - (place.get(b.id) ?? route.length + b.index))
    .map((entry) => entry.id);
}

/**
 * The route after a round was put in order: the machines of that round take
 * the places they already had on the route, in their new order, and every
 * other machine stays where it was. One not on the route yet joins at the end.
 */
export function mergeRoute(route: string[], chosen: string[]): string[] {
  const picked = [...new Set(chosen)];
  const inRound = new Set(picked);
  const queue = [...picked];
  return [...route, ...picked.filter((id) => !route.includes(id))].map((id) => (inRound.has(id) ? queue.shift()! : id));
}
