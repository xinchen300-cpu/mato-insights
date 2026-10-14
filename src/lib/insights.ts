import { busiestWeekday, compareCounts, compareSince, periodDays } from "@/lib/stats";
import type { StatsReport } from "@/lib/types";

// Plain-language observations, kept as data so each language renders its own
// sentence. None of them claims more than the numbers can carry: see lib/stats.
export type Insight =
  | { kind: "tooEarly"; days: number }
  | { kind: "bestDay"; weekday: number; pct: number; weeks: number }
  | { kind: "quietMachine"; machine: string; days: number }
  | { kind: "topShare"; machine: string; pct: number }
  | { kind: "bestSeller"; product: string; change: number | null }
  | { kind: "sharedLead"; first: string; second: string };

const DAY_MS = 24 * 60 * 60 * 1000;
/** Before this many days into the month, its numbers still swing too much to read. */
const EARLY_DAYS = 7;

export function buildInsights(
  month: StatsReport,
  /** Several full weeks: the only fair base for weekday patterns. */
  weeks: StatsReport,
  weekCount: number,
  lastSales: { name: string; lastSale: string | null }[],
): Insight[] {
  const insights: Insight[] = [];

  const monthDays = periodDays(month).length;
  if (monthDays < EARLY_DAYS) insights.push({ kind: "tooEarly", days: monthDays });

  const named = month.by_product.filter((p) => p.product_id && p.product_name && p.units > 0);
  const [first, second] = named.sort((a, b) => b.units - a.units);
  if (first) {
    if (second && compareCounts(first.units, second.units) !== "up") {
      insights.push({ kind: "sharedLead", first: first.product_name!, second: second.product_name! });
    } else {
      const verdict = compareSince(first.units, first.prev_units, first.first_sale, month.prev_start);
      insights.push({
        kind: "bestSeller",
        product: first.product_name!,
        change: (verdict === "up" || verdict === "down") && first.prev_units > 0
          ? (first.units - first.prev_units) / first.prev_units
          : null,
      });
    }
  }

  const busiest = busiestWeekday(weeks);
  if (busiest && busiest.pct > 0) insights.push({ kind: "bestDay", ...busiest, weeks: weekCount });

  // A machine that stopped selling asks for a visit: it goes first, the
  // longest silence on top, so the cut below never drops it for a pattern.
  const now = Date.now();
  const quiet: Insight[] = lastSales
    .filter((m) => m.lastSale)
    .map((m) => ({ machine: m.name, days: Math.floor((now - new Date(m.lastSale!).getTime()) / DAY_MS) }))
    .filter((m) => m.days >= 5)
    .sort((a, b) => b.days - a.days)
    .map((m) => ({ kind: "quietMachine" as const, ...m }));

  const total = month.by_machine.reduce((s, m) => s + m.revenue, 0);
  const top = month.by_machine[0];
  if (top && total > 0 && month.by_machine.length > 2 && top.revenue / total > 0.3) {
    insights.push({ kind: "topShare", machine: top.machine_name, pct: Math.round((top.revenue / total) * 100) });
  }

  return [...quiet, ...insights].slice(0, 4);
}
