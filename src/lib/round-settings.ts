/** How the operator wants a refill round to go, set on the Werkwijze page. */
export type RoundSettings = {
  /** Extra things to look at by every machine, ticked off like the slots. */
  checks: string[];
  /** A short message at the top of every round. */
  message: string | null;
  /** Ask the kilometres when closing the round: the drive in what it cost. */
  askKm: boolean;
  /** May a machine be skipped ("Overslaan")? */
  allowSkip: boolean;
  /** When the operator's phone hears about a round. */
  notify: { start: boolean; eachMachine: boolean; finish: boolean };
  /**
   * The route: machine ids in the order the owner wants them visited. Set when
   * a round is made, and every next round follows it.
   */
  route: string[];
};

export const MAX_CHECKS = 8;
export const MAX_CHECK_LENGTH = 60;
export const MAX_MESSAGE_LENGTH = 280;
export const MAX_ROUTE = 200;
const MACHINE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DEFAULT_ROUND_SETTINGS: RoundSettings = {
  checks: [],
  message: null,
  askKm: true,
  allowSkip: true,
  notify: { start: true, eachMachine: false, finish: true },
  route: [],
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
    askKm: flag(value.askKm, DEFAULT_ROUND_SETTINGS.askKm),
    allowSkip: flag(value.allowSkip, DEFAULT_ROUND_SETTINGS.allowSkip),
    notify: {
      start: flag(notify.start, DEFAULT_ROUND_SETTINGS.notify.start),
      eachMachine: flag(notify.eachMachine, DEFAULT_ROUND_SETTINGS.notify.eachMachine),
      finish: flag(notify.finish, DEFAULT_ROUND_SETTINGS.notify.finish),
    },
    route: [...new Set((Array.isArray(value.route) ? value.route : []).filter((id): id is string => typeof id === "string" && MACHINE_ID.test(id)))].slice(0, MAX_ROUTE),
  };
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
