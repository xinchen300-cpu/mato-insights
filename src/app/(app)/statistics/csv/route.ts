import { csvResponse } from "@/lib/csv";
import { getStatsReport } from "@/lib/data";
import { getI18n } from "@/i18n/server";
import { requireOrgId } from "@/lib/org";
import { parseStatsParams } from "@/lib/stats-params";
import { reportDay } from "@/lib/stats";

export async function GET(request: Request) {
  const { m } = await getI18n();
  const orgId = await requireOrgId();
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const { filters } = parseStatsParams(params);
  const report = await getStatsReport(orgId, filters);
  // The period is read where the business stands, not in UTC: a September
  // report must not tell the accountant it starts on 31 August. The end is the
  // first moment after the period, so the last day it covers is a tick earlier.
  const firstDay = reportDay(report.cur_start, report.timezone);
  const lastDay = reportDay(new Date(report.cur_end).getTime() - 1, report.timezone);

  const rows: (string | number | null)[][] = [
    [m.stats.period, firstDay, lastDay],
    [m.stats.revenue, report.totals.revenue],
    [m.stats.units, report.totals.units],
    [],
    [m.stats.perProduct],
    [m.stats.product, m.stats.units, m.stats.revenue],
    ...report.by_product.map((p) => [p.product_name ?? m.stats.unassignedProduct, p.units, p.revenue]),
    [],
    [m.stats.perMachine],
    [m.stats.machine, m.stats.units, m.stats.revenue],
    ...report.by_machine.map((r) => [r.machine_name, r.units, r.revenue]),
    [],
    [m.stats.revenueOverTime],
    ...report.by_day.map((d) => [d.day, d.units, d.revenue]),
  ];

  return csvResponse(`vendly-${report.period}-${firstDay}.csv`, rows);
}
