import ExcelJS from "exceljs";
import { fmt } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { denyFiller } from "@/lib/org";
import { attachment, exportRange, getSalesExport, type ExportLine } from "@/lib/sales-export";

const EURO = "€ #,##0.00";
const DATE = "dd/mm/yyyy";

/** The same export as the PDF, as a workbook: an overview, then a sheet per day, per product and per machine. */
export async function GET(request: Request) {
  await denyFiller();
  const data = await getSalesExport(new URL(request.url).searchParams);
  const { m, f } = await getI18n();
  const t = m.salesExport;

  const book = new ExcelJS.Workbook();
  book.creator = data.brand;
  book.created = new Date();
  const bold = (row: ExcelJS.Row) => {
    row.font = { bold: true };
    return row;
  };
  const sheetName = (name: string) => name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31);

  const summary = book.addWorksheet(sheetName(t.summary));
  summary.columns = [{ width: 30 }, { width: 14 }, { width: 16 }];
  summary.addRow([data.owner ?? data.brand]).font = { bold: true, size: 14 };
  summary.addRow([`${t.heading} · ${data.title}`]);
  summary.addRow([await exportRange(data)]);
  for (const line of data.filters) summary.addRow([line]);
  summary.addRow([]);
  summary.addRow([t.revenue, data.totals.revenue]).getCell(2).numFmt = EURO;
  summary.addRow([t.units, data.totals.units]);
  if (data.totals.units) summary.addRow([t.avgPrice, data.totals.revenue / data.totals.units]).getCell(2).numFmt = EURO;
  if (data.months.length) {
    summary.addRow([]);
    bold(summary.addRow([t.monthColumn, t.units, t.revenue]));
    for (const row of data.months) {
      const month = f.monthLongYear(row.month);
      summary.addRow([month.charAt(0).toUpperCase() + month.slice(1), row.units, row.revenue]).getCell(3).numFmt = EURO;
    }
    bold(summary.addRow([t.total, data.totals.units, data.totals.revenue])).getCell(3).numFmt = EURO;
  }
  summary.addRow([]);
  summary.addRow([t.inclVat]);
  if (data.withoutProduct) summary.addRow([t.noDetailNote]);
  summary.addRow([fmt(t.madeOn, { date: f.dateTime(new Date()), brand: data.brand })]);

  // Days as real dates, so the accountant can sort and sum them.
  const days = book.addWorksheet(sheetName(t.perDay));
  days.columns = [
    { header: t.date, key: "day", width: 14, style: { numFmt: DATE } },
    { header: t.units, key: "units", width: 10 },
    { header: t.revenue, key: "revenue", width: 14, style: { numFmt: EURO } },
  ];
  bold(days.getRow(1));
  for (const row of data.days) days.addRow({ day: new Date(`${row.day}T00:00:00Z`), units: row.units, revenue: row.revenue });
  bold(days.addRow({ day: t.total, units: data.totals.units, revenue: data.totals.revenue }));
  days.views = [{ state: "frozen", ySplit: 1 }];

  const lines = (name: string, column: string, rows: ExportLine[], withPrice: boolean) => {
    const sheet = book.addWorksheet(sheetName(name));
    sheet.columns = [
      { header: column, key: "label", width: 34 },
      { header: t.units, key: "units", width: 10 },
      ...(withPrice ? [{ header: t.avgPrice, key: "price", width: 14, style: { numFmt: EURO } }] : []),
      { header: t.revenue, key: "revenue", width: 14, style: { numFmt: EURO } },
    ];
    bold(sheet.getRow(1));
    for (const row of rows) {
      sheet.addRow({ label: row.label, units: row.units, price: row.units ? row.revenue / row.units : null, revenue: row.revenue });
    }
    bold(sheet.addRow({ label: t.total, units: data.totals.units, revenue: data.totals.revenue }));
    sheet.views = [{ state: "frozen", ySplit: 1 }];
  };
  lines(m.stats.perProduct, m.stats.product, data.withoutProduct ? [...data.products, data.withoutProduct] : data.products, true);
  lines(m.stats.perMachine, m.stats.machine, data.machines, false);

  const buffer = await book.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": attachment(`${data.fileBase}.xlsx`),
      "Cache-Control": "no-store",
    },
  });
}
