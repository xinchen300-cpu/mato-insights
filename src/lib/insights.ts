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

  const now = Date.now();
  for (const m of lastSales) {
    if (!m.lastSale) continue;
    const days = Math.floor((now - new Date(m.lastSale).getTime()) / DAY_MS);
    if (days >= 5) insights.push({ kind: "quietMachine", machine: m.name, days });
  }

  const total = month.by_machine.reduce((s, m) => s + m.revenue, 0);
  const top = month.by_machine[0];
  if (top && total > 0 && month.by_machine.length > 2 && top.revenue / total > 0.3) {
    insights.push({ kind: "topShare", machine: top.machine_name, pct: Math.round((top.revenue / total) * 100) });
  }

  return insights.slice(0, 4);
}
