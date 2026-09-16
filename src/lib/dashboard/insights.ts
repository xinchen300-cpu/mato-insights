import type { DailyRevenue, MachineLastSale, MachineRevenue } from "./queries";

export type Insight = { text: string; tone: "positive" | "warning" | "neutral" };

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function buildInsights(
  daily: DailyRevenue[],
  byMachine: MachineRevenue[],
  lastSales: MachineLastSale[],
): Insight[] {
  const insights: Insight[] = [];

  // Best day of week, by average revenue.
  if (daily.length >= 7) {
    const byDow = new Map<number, { total: number; count: number }>();
    for (const d of daily) {
      const dow = new Date(d.day).getDay();
      const entry = byDow.get(dow) ?? { total: 0, count: 0 };
      entry.total += d.revenue;
      entry.count += 1;
      byDow.set(dow, entry);
    }
    const avgAll = daily.reduce((s, d) => s + d.revenue, 0) / daily.length;
    let bestDow = -1;
    let bestAvg = 0;
    for (const [dow, { total, count }] of byDow) {
      const avg = total / count;
      if (avg > bestAvg) {
        bestAvg = avg;
        bestDow = dow;
      }
    }
    if (bestDow >= 0 && avgAll > 0) {
      const pctAbove = ((bestAvg - avgAll) / avgAll) * 100;
      if (pctAbove > 10) {
        insights.push({
          text: `${DAY_NAMES[bestDow]}s outsell your average day by ${pctAbove.toFixed(0)}% — worth keeping best stocked.`,
          tone: "positive",
        });
      }
    }
  }

  // Quiet machines: no approved sale in 5+ days.
  const now = Date.now();
  for (const m of lastSales) {
    if (!m.last_sale) continue;
    const daysSince = (now - new Date(m.last_sale).getTime()) / (24 * 60 * 60 * 1000);
    if (daysSince >= 5) {
      const where = m.location_name ?? m.machine_name ?? "A machine";
      insights.push({
        text: `${where} has had no sales in ${Math.floor(daysSince)} days — worth checking on.`,
        tone: "warning",
      });
    }
  }

  // Top machine concentration.
  if (byMachine.length > 1) {
    const total = byMachine.reduce((s, m) => s + Number(m.revenue), 0);
    const top = byMachine[0];
    if (total > 0) {
      const share = (Number(top.revenue) / total) * 100;
      if (share > 30) {
        const where = top.location_name ?? top.machine_name ?? "Your top machine";
        insights.push({
          text: `${where} alone drives ${share.toFixed(0)}% of revenue in this period.`,
          tone: "neutral",
        });
      }
    }
  }

  return insights.slice(0, 4);
}
