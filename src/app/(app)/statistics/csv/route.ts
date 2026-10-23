import { csvResponse } from "@/lib/csv";
import { getI18n } from "@/i18n/server";
import { denyFiller } from "@/lib/org";
import { getSalesExport } from "@/lib/sales-export";

// The same export as the PDF and the workbook, as one plain file: days as
// 2026-09-01, which any accounting program reads, in the business's own days.
export async function GET(request: Request) {
  await denyFiller();
  const data = await getSalesExport(new URL(request.url).searchParams);
  const { m } = await getI18n();
  const t = m.salesExport;
  const total = [t.total, data.totals.units, data.totals.revenue];

  const rows: (string | number | null)[][] = [
    [data.owner ?? data.brand],
    [`${t.heading} · ${data.title}`],
    [m.stats.period, data.firstDay, data.lastDay],
    ...data.filters.map((line) => [line]),
    [t.revenue, data.totals.revenue],
    [t.units, data.totals.units],
    [t.inclVat],
    [],
    [t.perDay],
    [t.date, t.units, t.revenue],
    ...data.days.map((d) => [d.day, d.units, d.revenue]),
    total,
    [],
    [m.stats.perProduct],
    [m.stats.product, t.units, t.revenue],
    ...[...data.products, ...(data.withoutProduct ? [data.withoutProduct] : [])].map((p) => [p.label, p.units, p.revenue]),
    total,
    [],
    [m.stats.perMachine],
    [m.stats.machine, t.units, t.revenue],
    ...data.machines.map((r) => [r.label, r.units, r.revenue]),
    total,
  ];

  return csvResponse(`${data.fileBase}.csv`, rows);
}
