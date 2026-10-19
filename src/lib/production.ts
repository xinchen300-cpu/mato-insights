// What a producer makes tonight for tomorrow's round (Xin, 19-10-2026): per
// dish, what the machines will lack when the round fills them, minus what is
// already in the fridge, and never less than the dish's batch once anything
// is needed. The kitchen cooks in the evening, the round fills in the morning.
// Pure logic, checked by npm run test:flow.
//
// Every number has to be explainable to the kitchen: places empty now, what
// sells until the round, what is in the fridge. A change in what a dish sells
// is only mentioned when stats.ts calls it real.

import { compareSince } from "@/lib/stats";

const TIME_ZONE = "Europe/Brussels";
/** The round fills the machines in the morning. */
export const FILL_HOUR = 9;
/** Food for a fill is cooked the evening before, so the fill it serves is at least this far off. */
export const LEAD_HOURS = 6;
/** The pace of a slot: its sales of the last eight weeks, per weekday. */
export const RATE_DAYS = 56;
/** Stock not counted or filled for this long is not trusted: such a machine is read as topped up daily. */
export const STALE_HOURS = 72;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const localParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** The weekday (Monday = 1) and hour of a moment where the business stands. */
export function localTime(at: Date): { weekday: number; hour: number; minute: number } {
  const parts = Object.fromEntries(localParts.formatToParts(at).map((part) => [part.type, part.value]));
  return { weekday: WEEKDAYS.indexOf(parts.weekday) + 1, hour: Number(parts.hour), minute: Number(parts.minute) };
}

/** The round this evening's cooking is for: the first FILL_HOUR at least LEAD_HOURS away. */
export function nextFill(now: Date): Date {
  // Belgian hours start on UTC hour boundaries, so stepping by whole UTC hours meets every local one.
  let at = new Date(Math.ceil((now.getTime() + LEAD_HOURS * HOUR) / HOUR) * HOUR);
  for (let step = 0; step < 48 && localTime(at).hour !== FILL_HOUR; step++) at = new Date(at.getTime() + HOUR);
  return at;
}

/** Each hour's share of a day's sales, from the sales per hour; flat when there are none. */
export function hourShares(units: { hour: number; units: number }[]): number[] {
  const byHour = Array.from({ length: 24 }, (_, hour) => units.filter((u) => u.hour === hour).reduce((s, u) => s + u.units, 0));
  const total = byHour.reduce((s, n) => s + n, 0);
  return total > 0 ? byHour.map((n) => n / total) : byHour.map(() => 1 / 24);
}

/** Expected sales between two moments, from a pace per weekday (index 1–7, pieces a day) and the hour shares. */
export function salesBetween(perDay: number[], shares: number[], from: Date, to: Date): number {
  let total = 0;
  for (let t = from.getTime(); t < to.getTime(); ) {
    const next = Math.min(Math.floor(t / HOUR) * HOUR + HOUR, to.getTime());
    const { weekday, hour } = localTime(new Date(t));
    total += (perDay[weekday] ?? 0) * shares[hour] * ((next - t) / HOUR);
    t = next;
  }
  return total;
}

/** How many of each weekday fall from `start` up to `now` (index 1–7). */
function weekdayCounts(start: Date, now: Date): number[] {
  const counts = Array(8).fill(0);
  for (let t = start.getTime(); t < now.getTime(); t += DAY) counts[localTime(new Date(t)).weekday] += 1;
  return counts;
}

export type ProductionDish = { id: string; name: string; photoPath: string | null; batchMin: number };
export type ProductionSlot = {
  machineId: string;
  selection: string;
  productId: string | null;
  capacity: number;
  stock: number | null;
  /** When the stock was last counted or filled. */
  countedAt: string | null;
};
export type WeekdaySales = { machineId: string; selection: string; weekday: number; units: number; firstSale: string };

export type ProductionInput = {
  now: Date;
  dishes: ProductionDish[];
  /** Machines filled by hand (Torhout): their stock is not followed, they are topped up daily. */
  manual: string[];
  slots: ProductionSlot[];
  sales: WeekdaySales[];
  hourUnits: { hour: number; units: number }[];
  fridge: { productId: string; inFridge: number | null; madeToday: number }[];
  /** Pieces per dish over the last four weeks and the four before, for the trend. */
  trends: { productId: string; units: number; prevUnits: number; firstSale: string | null }[];
  trendPrevStart: string;
};

export type ProductionLine = {
  productId: string;
  name: string;
  photoPath: string | null;
  batchMin: number;
  /** Places empty in the machines now, where their stock is followed. */
  emptyNow: number;
  /** Expected sales until the round fills them. */
  sells: number;
  /** What the round will need of it. */
  need: number;
  /** What the fridge holds, or null while it was never counted or filled. */
  inFridge: number | null;
  /**
   * What to make tonight: nothing, or at least the batch. Nothing while the
   * fridge was never counted: the list cannot know what is still in it, and a
   * batch on every dish would be cooking blind (it asks for a count instead).
   */
  make: number;
  madeToday: number;
  /** Only a real change; nothing when it is noise, too little or new. */
  trend: "up" | "down" | null;
};

export function productionPlan(input: ProductionInput): { fillAt: Date; lines: ProductionLine[] } {
  const { now } = input;
  const fillAt = nextFill(now);
  const shares = hourShares(input.hourUnits);
  const manual = new Set(input.manual);

  // Each slot's pace per weekday, per day the machine was selling in the window.
  const windowStart = new Date(now.getTime() - RATE_DAYS * DAY);
  const pace = new Map<string, number[]>();
  const bySlot = new Map<string, WeekdaySales[]>();
  for (const row of input.sales) {
    const key = `${row.machineId}|${row.selection}`;
    bySlot.set(key, [...(bySlot.get(key) ?? []), row]);
  }
  for (const [key, rows] of bySlot) {
    const start = new Date(Math.max(windowStart.getTime(), new Date(rows[0].firstSale).getTime()));
    const days = weekdayCounts(start, now);
    const totalDays = days.reduce((s, n) => s + n, 0);
    const totalUnits = rows.reduce((s, r) => s + r.units, 0);
    const perDay = Array(8).fill(0);
    for (let weekday = 1; weekday <= 7; weekday++) {
      const units = rows.filter((r) => r.weekday === weekday).reduce((s, r) => s + r.units, 0);
      // A weekday not seen yet takes the slot's plain daily pace.
      perDay[weekday] = days[weekday] > 0 ? units / days[weekday] : totalDays > 0 ? totalUnits / totalDays : 0;
    }
    pace.set(key, perDay);
  }

  const lines = input.dishes.map((dish): ProductionLine => {
    let emptyNow = 0;
    let sells = 0;
    let need = 0;
    for (const slot of input.slots.filter((s) => s.productId === dish.id)) {
      const perDay = pace.get(`${slot.machineId}|${slot.selection}`) ?? Array(8).fill(0);
      const fresh =
        slot.stock !== null && slot.countedAt !== null && now.getTime() - new Date(slot.countedAt).getTime() < STALE_HOURS * HOUR;
      if (manual.has(slot.machineId) || !fresh) {
        // Not followed: topped up every day, so the round replaces a day's sales.
        const day = Math.min(slot.capacity, salesBetween(perDay, shares, new Date(fillAt.getTime() - DAY), fillAt));
        sells += day;
        need += day;
      } else {
        const until = salesBetween(perDay, shares, now, fillAt);
        emptyNow += Math.max(0, slot.capacity - slot.stock!);
        sells += Math.min(until, slot.stock!);
        need += slot.capacity - Math.max(0, slot.stock! - until);
      }
    }
    const fridge = input.fridge.find((f) => f.productId === dish.id);
    const inFridge = fridge?.inFridge ?? null;
    const needed = Math.round(need);
    const short = needed - (inFridge ?? 0);
    const trend = input.trends.find((t) => t.productId === dish.id);
    const verdict = trend ? compareSince(trend.units, trend.prevUnits, trend.firstSale, input.trendPrevStart) : null;
    return {
      productId: dish.id,
      name: dish.name,
      photoPath: dish.photoPath,
      batchMin: dish.batchMin,
      emptyNow,
      sells: Math.round(sells),
      need: needed,
      inFridge,
      make: inFridge !== null && short > 0 ? Math.max(short, dish.batchMin) : 0,
      madeToday: fridge?.madeToday ?? 0,
      trend: verdict === "up" || verdict === "down" ? verdict : null,
    };
  });

  // What to make first, then what is needed (an uncounted fridge among them), then by name.
  lines.sort((a, b) => b.make - a.make || b.need - a.need || a.name.localeCompare(b.name));
  return { fillAt, lines };
}
