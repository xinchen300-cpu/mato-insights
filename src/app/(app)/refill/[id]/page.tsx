import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheck, FileSpreadsheet, Printer } from "lucide-react";
import { PageHeader, Panel } from "@/components/page-header";
import { SheetTables } from "@/components/refill/sheet-tables";
import { buttonVariants } from "@/components/ui/button";
import { fmt } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { getRefillSheet, getRunSummary } from "@/lib/data";
import { requireOrgId } from "@/lib/org";
import { NotesForm } from "./notes-form";
import { RunReport } from "./run-report";
import { ShareBox } from "./share-box";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.refill.sheetTitle };
}

export default async function RefillSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { m, f } = await getI18n();
  const orgId = await requireOrgId();

  const sheet = await getRefillSheet(orgId, id);
  if (!sheet) notFound();

  // Only a closed run has something to report.
  const summary = sheet.completed_at ? await getRunSummary(orgId, sheet.id) : [];

  const total = sheet.lines.reduce((sum, l) => sum + l.to_add, 0);

  // The cool box is keyed by product id; the lines know the names.
  const nameOf = new Map(sheet.lines.map((l) => [l.product_id, l.product_name]));
  // Keyed by product id, since two products may share a name, and a product
  // that dropped out of the plan would otherwise render as a nameless "—".
  const box = Object.entries(sheet.box ?? {})
    .map(([id, qty]) => ({ id, name: nameOf.get(id) ?? null, qty }))
    .filter((row) => row.name !== null)
    .sort((a, b) => b.qty - a.qty);

  const minutes =
    sheet.started_at && sheet.completed_at
      ? Math.max(1, Math.round((new Date(sheet.completed_at).getTime() - new Date(sheet.started_at).getTime()) / 60000))
      : null;

  return (
    <>
      <PageHeader
        backHref="/refill"
        backLabel={m.refill.title}
        eyebrow={fmt(m.refill.createdAt, { date: f.dateTime(sheet.created_at) })}
        title={m.refill.sheetTitle}
        subtitle={fmt(m.refill.items, { count: total })}
        actions={
          <>
            <Link href={`/print/refill/${sheet.id}`} target="_blank" className={buttonVariants({ variant: "outline" })}>
              <Printer />
              {m.refill.print}
            </Link>
            <a href={`/refill/${sheet.id}/csv`} className={buttonVariants({ variant: "outline" })}>
              <FileSpreadsheet />
              {m.refill.csv}
            </a>
          </>
        }
      />

      {sheet.completed_at && (
        <p className="mb-6 flex items-center gap-2 border border-positive/40 bg-card p-4 font-semibold text-positive">
          <CircleCheck className="size-5" />
          {fmt(m.refill.completedAt, { date: f.dateTime(sheet.completed_at) })}
        </p>
      )}

      {sheet.completed_at && (
        <Panel title={m.refill.reportTitle} hint={m.refill.reportHint} className="mb-8">
          <RunReport rows={summary} when={f.dateTime(sheet.completed_at)} />
        </Panel>
      )}

      <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <SheetTables lines={sheet.lines} m={m} />
        <div className="flex flex-col gap-6 lg:sticky lg:top-24 lg:self-start">
          {!sheet.completed_at && (
            <Panel title={m.refill.share}>
              <ShareBox token={sheet.share_token} />
            </Panel>
          )}
          {(minutes !== null || sheet.km !== null || sheet.filled_by) && (
            <Panel title={m.refill.runFacts}>
              <ul className="flex flex-col divide-y">
                {sheet.filled_by && (
                  <li className="flex items-baseline justify-between gap-4 py-2.5">
                    <span className="text-sm text-muted-foreground">{m.refill.filler}</span>
                    <span className="font-semibold">{sheet.filled_by}</span>
                  </li>
                )}
                {minutes !== null && (
                  <li className="flex items-baseline justify-between gap-4 py-2.5">
                    <span className="text-sm text-muted-foreground">{m.machines.history}</span>
                    <span className="tabular font-semibold">{fmt(m.refill.runTime, { minutes })}</span>
                  </li>
                )}
                {sheet.km !== null && (
                  <li className="flex items-baseline justify-between gap-4 py-2.5">
                    <span className="text-sm text-muted-foreground">{m.refill.kmLabel}</span>
                    <span className="tabular font-semibold">{fmt(m.refill.runKm, { km: sheet.km })}</span>
                  </li>
                )}
              </ul>
            </Panel>
          )}

          {!sheet.completed_at && (
            <Panel title={m.refill.boxTitle} hint={m.refill.boxHint}>
              {box.length === 0 ? (
                <p className="text-sm text-muted-foreground">{m.refill.boxEmpty}</p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {box.map((row) => (
                    <li key={row.id} className="flex items-baseline justify-between gap-4 py-2.5">
                      <span className="min-w-0 truncate">{row.name}</span>
                      <span className="tabular font-semibold">{row.qty}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}

          <Panel title={m.refill.notes}>
            <NotesForm sheetId={sheet.id} initialNotes={sheet.notes ?? ""} />
          </Panel>
        </div>
      </div>
    </>
  );
}
