import PDFDocument from "pdfkit";
import { intlLocale } from "@/i18n/config";
import { fmt, type Formatters } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { denyFiller } from "@/lib/org";
import type { Messages } from "@/i18n/messages/en";
import { attachment, exportRange, getSalesExport, type ExportLine, type SalesExport } from "@/lib/sales-export";

// pdfkit reads its font metrics from files on disk (next.config.ts keeps them in the trace).
export const runtime = "nodejs";

const GOLD = "#A6752C";
const INK = "#2A2520";
const MUTED = "#6F6A64";
const LINE = "#E4DED6";
const SOFT = "#F6F3EE";

const MARGIN = 48;
const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const CONTENT = PAGE_WIDTH - MARGIN * 2;
const BOTTOM = PAGE_HEIGHT - MARGIN - 28;
/** Up to about three months the PDF lists every day; a year is the months, the days are in Excel and CSV. */
const MAX_DAYS = 93;

export async function GET(request: Request) {
  await denyFiller();
  const data = await getSalesExport(new URL(request.url).searchParams);
  const { m, f, locale } = await getI18n();
  const pdf = await render(data, { m, f, tag: intlLocale[locale], range: await exportRange(data) });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": attachment(`${data.fileBase}.pdf`),
      "Cache-Control": "no-store",
    },
  });
}

type Context = { m: Messages; f: Formatters; tag: string; range: string };
type Doc = PDFKit.PDFDocument;

// The PDF's built-in Helvetica knows Western European letters only: French
// money groups thousands with a narrow space it lacks, so that becomes a plain one.
const safe = (text: string) => text.replace(/[  ]/g, " ");

function render(data: SalesExport, { m, f, tag, range }: Context): Promise<Buffer> {
  const t = m.salesExport;
  const doc = new PDFDocument({
    size: "A4",
    margin: MARGIN,
    bufferPages: true,
    info: { Title: safe(`${t.heading} ${data.title}`), Author: safe(data.owner ?? data.brand), Creator: data.brand },
  });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const weekdayDate = new Intl.DateTimeFormat(tag, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const dayLabel = (day: string) => safe(weekdayDate.format(new Date(`${day}T12:00:00Z`)));
  const euro = (value: number) => safe(f.euro(value));
  const number = (value: number) => safe(f.number(value));

  // The logo as text: [mato info] with gold brackets.
  doc.font("Helvetica-Bold").fontSize(11).fillColor(GOLD).text("[ ", MARGIN, MARGIN, { continued: true });
  doc.fillColor(INK).text(safe(data.brand.toLowerCase()), { continued: true });
  doc.fillColor(GOLD).text(" ]");
  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor(MUTED)
    .text(safe(f.date(new Date())), MARGIN, MARGIN + 1, { width: CONTENT, align: "right" });

  doc.y = MARGIN + 34;
  if (data.owner) doc.font("Helvetica-Bold").fontSize(20).fillColor(INK).text(safe(data.owner), MARGIN, doc.y, { width: CONTENT });
  doc.font("Helvetica").fontSize(13).fillColor(INK).text(safe(`${t.heading} · ${data.title}`), MARGIN, doc.y + 2, { width: CONTENT });
  doc.font("Helvetica").fontSize(9.5).fillColor(MUTED).text(safe(range), { width: CONTENT });
  if (data.filters.length) doc.text(safe(data.filters.join(" · ")), { width: CONTENT });
  doc.moveDown(1.2);

  // Three figures side by side, on a soft band.
  const tiles: [string, string][] = [
    [t.revenue, euro(data.totals.revenue)],
    [t.units, number(data.totals.units)],
    [t.avgPrice, data.totals.units ? euro(data.totals.revenue / data.totals.units) : "–"],
  ];
  const tileTop = doc.y;
  doc.roundedRect(MARGIN, tileTop, CONTENT, 58, 8).fill(SOFT);
  const tileWidth = (CONTENT - 32) / 3;
  tiles.forEach(([label, value], i) => {
    const x = MARGIN + 16 + i * tileWidth;
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(MUTED).text(safe(label.toUpperCase()), x, tileTop + 13, { width: tileWidth - 8, characterSpacing: 0.8 });
    doc.font("Helvetica-Bold").fontSize(17).fillColor(INK).text(value, x, tileTop + 27, { width: tileWidth - 8 });
  });
  doc.y = tileTop + 58 + 10;

  if (data.totals.units === 0 && Math.abs(data.totals.revenue) < 0.005) {
    doc.moveDown(1);
    doc.font("Helvetica").fontSize(11).fillColor(MUTED).text(safe(m.stats.noSales), MARGIN, doc.y, { width: CONTENT });
  } else {
    if (data.months.length) {
      section(doc, t.perMonth);
      table(
        doc,
        [t.monthColumn, t.units, t.revenue],
        [CONTENT - 200, 90, 110],
        data.months.map((row) => [safe(capitalize(f.monthLongYear(row.month))), number(row.units), euro(row.revenue)]),
        [t.total, number(data.totals.units), euro(data.totals.revenue)],
      );
    }

    if (data.days.length <= MAX_DAYS) {
      section(doc, t.perDay);
      table(
        doc,
        [t.date, t.units, t.revenue],
        [CONTENT - 200, 90, 110],
        data.days.map((row) => [dayLabel(row.day), number(row.units), euro(row.revenue)]),
        [t.total, number(data.totals.units), euro(data.totals.revenue)],
        data.days.map((row) => row.units === 0),
      );
    }

    const lines = (rows: ExportLine[]) => rows.map((row) => [safe(row.label), number(row.units), row.units ? euro(row.revenue / row.units) : "–", euro(row.revenue)]);
    section(doc, m.stats.perProduct);
    table(
      doc,
      [m.stats.product, t.units, t.avgPrice, t.revenue],
      [CONTENT - 280, 80, 90, 110],
      [...lines(data.products), ...(data.withoutProduct ? lines([data.withoutProduct]) : [])],
      [t.total, number(data.totals.units), "", euro(data.totals.revenue)],
    );

    if (data.machines.length > 1 || data.filters.length === 0) {
      section(doc, m.stats.perMachine);
      table(
        doc,
        [m.stats.machine, t.units, t.revenue],
        [CONTENT - 200, 90, 110],
        data.machines.map((row) => [safe(row.label), number(row.units), euro(row.revenue)]),
        [t.total, number(data.totals.units), euro(data.totals.revenue)],
      );
    }
  }

  // What the amounts are, and when and with what this was made.
  if (doc.y > BOTTOM - 50) doc.addPage();
  doc.moveDown(1.2);
  const notes = [
    t.inclVat,
    data.withoutProduct ? t.noDetailNote : null,
    data.days.length > MAX_DAYS ? t.daysInExcel : null,
    fmt(t.madeOn, { date: f.dateTime(new Date()), brand: data.brand }),
  ].filter((note): note is string => Boolean(note));
  doc.font("Helvetica").fontSize(8).fillColor(MUTED);
  for (const note of notes) doc.text(safe(note), MARGIN, doc.y, { width: CONTENT });

  // Every page: who and what at the foot, and its number.
  const { start, count } = doc.bufferedPageRange();
  for (let i = start; i < start + count; i++) {
    doc.switchToPage(i);
    // Below the bottom margin pdfkit would start a new page for it.
    doc.page.margins.bottom = 0;
    const y = PAGE_HEIGHT - MARGIN + 10;
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED);
    doc.text(safe([data.owner, `${t.heading} ${data.title}`].filter(Boolean).join(" · ")), MARGIN, y, { width: CONTENT - 60, lineBreak: false });
    doc.text(`${i - start + 1} / ${count}`, PAGE_WIDTH - MARGIN - 60, y, { width: 60, align: "right", lineBreak: false });
  }

  doc.end();
  return done;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function rule(doc: Doc, color = LINE) {
  doc.moveTo(MARGIN, doc.y).lineTo(PAGE_WIDTH - MARGIN, doc.y).lineWidth(0.5).strokeColor(color).stroke();
}

function section(doc: Doc, title: string) {
  if (doc.y > BOTTOM - 90) doc.addPage();
  doc.moveDown(1);
  doc.font("Helvetica-Bold").fontSize(12).fillColor(INK).text(safe(title), MARGIN, doc.y, { width: CONTENT });
  doc.moveDown(0.35);
}

/** The first column reads left, the figures right, as on any statement. */
function cells(doc: Doc, values: string[], widths: number[], top: number) {
  let x = MARGIN;
  values.forEach((value, i) => {
    doc.text(value, x, top, { width: widths[i] - (i === 0 ? 8 : 0), align: i === 0 ? "left" : "right", lineBreak: false, ellipsis: true });
    x += widths[i];
  });
}

function header(doc: Doc, values: string[], widths: number[]) {
  const top = doc.y;
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(MUTED);
  cells(doc, values.map((v) => safe(v.toUpperCase())), widths, top);
  doc.y = top + 12;
  rule(doc);
  doc.y += 5;
}

function table(doc: Doc, head: string[], widths: number[], rows: string[][], total: string[], quiet: boolean[] = []) {
  header(doc, head, widths);
  rows.forEach((row, i) => {
    if (doc.y > BOTTOM - 16) {
      doc.addPage();
      header(doc, head, widths);
    }
    const top = doc.y;
    doc.font("Helvetica").fontSize(9.5).fillColor(quiet[i] ? MUTED : INK);
    cells(doc, row, widths, top);
    doc.y = top + 15;
  });
  if (doc.y > BOTTOM - 20) {
    doc.addPage();
    header(doc, head, widths);
  }
  doc.y += 1;
  rule(doc, INK);
  doc.y += 5;
  const top = doc.y;
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor(INK);
  cells(doc, total.map(safe), widths, top);
  doc.y = top + 16;
}
