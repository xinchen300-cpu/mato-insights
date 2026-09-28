import { csvResponse } from "@/lib/csv";
import { getStatsReport } from "@/lib/data";
import { getI18n } from "@/i18n/server";
import { requireOrgId } from "@/lib/org";
import { parseStatsParams } from "@/lib/stats-params";

export async function GET(request: Request) {
  const { m } = await getI18n();
  const orgId = await requireOrgId();
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const { filters } = parseStatsParams(params);
  const report = await getStatsReport(orgId, filters);

  const rows: (string | number | null)[][] = [
    [m.stats.period, report.cur_start.slice(0, 10), report.cur_end.slice(0, 10)],
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

  return csvResponse(`vendly-${report.period}-${report.cur_start.slice(0, 10)}.csv`, rows);
}
