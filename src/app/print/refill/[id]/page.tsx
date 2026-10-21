import { notFound } from "next/navigation";
import { VendlyWordmark } from "@/components/brand/vendly-mark";
import { SheetTables } from "@/components/refill/sheet-tables";
import { fmt } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { getRefillSheet, getRunSummary } from "@/lib/data";
import { denyFiller, requireOrgId } from "@/lib/org";
import { linesToFill } from "@/lib/refill";
import { roundActual } from "@/lib/refill-flow";
import { AutoPrint } from "./auto-print";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.refill.sheetTitle };
}

// A4, black on white, with tick boxes: printed or saved as PDF from the browser.
export default async function PrintRefillSheetPage({ params }: { params: Promise<{ id: string }> }) {
  await denyFiller();
  const { id } = await params;
  const { m, f } = await getI18n();
  const orgId = await requireOrgId();

  const sheet = await getRefillSheet(orgId, id);
  if (!sheet) notFound();

  // A finished step-by-step round prints what went in, as its page shows it.
  const summary = sheet.flow_version === 2 && sheet.completed_at ? await getRunSummary(orgId, sheet.id) : [];
  const real = roundActual(
    sheet,
    summary.map((row) => ({ productId: row.product_id, qty: row.short })),
  );
  const total = real
    ? Object.values(real.actual.filled).reduce((sum, n) => sum + n, 0)
    : sheet.lines.reduce((sum, l) => sum + l.to_add, 0);

  return (
    <div className="light mx-auto max-w-[210mm] bg-white p-8 text-foreground shadow-none print:p-0 [&_table]:bg-white">
      <style>{`@page { size: A4; margin: 14mm; } @media print { body { background: white; } }`}</style>
      <div className="mb-6 flex items-start justify-between gap-4 border-b pb-4">
        <div>
          <VendlyWordmark name={m.brand.name} />
          <h1 className="mt-5 text-[28px] font-semibold tracking-[-0.03em]">{m.refill.sheetTitle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {fmt(m.refill.createdAt, { date: f.dateTime(sheet.created_at) })} · {fmt(m.refill.items, { count: total })}
          </p>
        </div>
        <AutoPrint label={m.refill.print} />
      </div>
      {sheet.notes && (
        <div className="mb-6 rounded-lg border p-3 text-sm">
          <p className="eyebrow mb-1">{m.refill.notes}</p>
          <p className="whitespace-pre-wrap">{sheet.notes}</p>
        </div>
      )}
      <SheetTables lines={linesToFill(sheet.lines)} m={m} printable actual={real?.actual} />
    </div>
  );
}
