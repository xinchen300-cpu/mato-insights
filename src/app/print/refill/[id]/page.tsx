import { notFound } from "next/navigation";
import { VendlyWordmark } from "@/components/brand/vendly-mark";
import { SheetTables } from "@/components/refill/sheet-tables";
import { fmt } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { getRefillSheet } from "@/lib/data";
import { requireOrgId } from "@/lib/org";
import { AutoPrint } from "./auto-print";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.refill.sheetTitle };
}

// A4, black on white, with tick boxes: printed or saved as PDF from the browser.
export default async function PrintRefillSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { m, f } = await getI18n();
  const orgId = await requireOrgId();

  const sheet = await getRefillSheet(orgId, id);
  if (!sheet) notFound();

  const total = sheet.lines.reduce((sum, l) => sum + l.to_add, 0);

  return (
    <div className="mx-auto max-w-[210mm] bg-white p-8 text-foreground shadow-none print:p-0 [&_table]:bg-white">
      <style>{`@page { size: A4; margin: 14mm; } @media print { body { background: white; } }`}</style>
      <div className="mb-6 flex items-start justify-between gap-4 border-b pb-4">
        <div>
          <VendlyWordmark />
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
      <SheetTables lines={sheet.lines} m={m} printable />
    </div>
  );
}
