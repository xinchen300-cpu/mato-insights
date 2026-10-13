import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CircleCheck, FileSpreadsheet, Printer } from "lucide-react";
import { KpiHero } from "@/components/kpi";
import { Avatar, ListRow, RowList, initial } from "@/components/list-row";
import { PageHeader, Section } from "@/components/page-header";
import { SheetTables } from "@/components/refill/sheet-tables";
import { buttonVariants } from "@/components/ui/button";
import { duration, fmt } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { LiveRounds } from "@/components/refill/live-rounds";
import { getMachines, getOpenRounds, getRefillSheet, getRunSummary } from "@/lib/data";
import { linesToFill } from "@/lib/refill";
import { isFiller, isOperator, requireOrgId, requireRefillAccess } from "@/lib/org";
import { cn } from "@/lib/utils";
import { NotesForm } from "./notes-form";
import { RunReport } from "./run-report";
import { ShareBox } from "./share-box";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.refill.sheetTitle };
}

export default async function RefillSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // The operator's view of a round (notes, links, report). A filler fills it.
  if (await isFiller()) {
    await requireRefillAccess();
    redirect(/^[0-9a-f-]{36}$/i.test(id) ? `/vullen/${id}` : "/refill");
  }
  const { m, f } = await getI18n();
  const orgId = await requireOrgId();

  const sheet = await getRefillSheet(orgId, id);
  if (!sheet) notFound();

  // Only a closed run has something to report.
  const summary = sheet.completed_at ? await getRunSummary(orgId, sheet.id) : [];
  // A stop with nothing to fill has no line to borrow a name from.
  const step = sheet.flow_version === 2;
  // A shop follows the round; doing it is for the operator and their fillers.
  const canFill = step && (await isOperator());
  // Out right now: the same live card as on the overview, kept fresh.
  const live = canFill && sheet.started_at && !sheet.completed_at ? (await getOpenRounds(orgId)).filter((r) => r.id === sheet.id) : [];
  const machineName = new Map(step ? (await getMachines(orgId)).map((machine) => [machine.id, machine.name]) : []);

  const total = sheet.lines.reduce((sum, l) => sum + l.to_add, 0);

  // The cool box is keyed by product id; the lines know the names.
  const nameOf = new Map(sheet.lines.map((l) => [l.product_id, l.product_name]));
  // Keyed by product id, since two products may share a name, and a product
  // that dropped out of the plan would otherwise render as a nameless "—".
  // A product that dropped out of the plan is still in the van, so it stays on
  // the list with a dash for a name. Hiding it would claim an empty cool box.
  // Flow 2 keys the box per machine and product; flow 1 per product.
  const box = Object.entries(sheet.box ?? {})
    .map(([key, qty]) => ({ id: key, name: nameOf.get(step ? key.split(":")[1] : key) ?? "—", qty }))
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

      {/* The one figure of a sheet: how much goes into the machines. */}
      <div className="-mt-2 mb-10 flex flex-col px-1 sm:-mt-4">
        <KpiHero label={m.refill.total} value={fmt(m.refill.items, { count: total })} f={f} />
        {sheet.completed_at && (
          <p className="flex items-center gap-2 text-[15px] font-medium text-positive">
            <CircleCheck className="size-[18px]" />
            {fmt(m.refill.completedAt, { date: f.dateTime(sheet.completed_at) })}
          </p>
        )}
      </div>

      {live.length > 0 && (
        <div className="mb-10">
          <LiveRounds rounds={live} link="fill" />
        </div>
      )}

      {sheet.completed_at && (
        <Section title={m.refill.reportTitle} hint={m.refill.reportHint} className="mb-10">
          <div className="surface-card px-5 py-4 sm:px-6 sm:py-5">
            <RunReport rows={summary} when={f.dateTime(sheet.completed_at)} />
          </div>
        </Section>
      )}

      <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr] lg:gap-8">
        <SheetTables lines={linesToFill(sheet.lines)} m={m} />
        {/* On a phone an open sheet leads with what the operator does next:
            share it, leave a note. A closed one leads with the list. */}
        <div
          className={cn(
            "flex flex-col gap-8 lg:sticky lg:top-24 lg:self-start",
            !sheet.completed_at && "order-first lg:order-none",
          )}
        >
          {!sheet.completed_at && canFill && (
            <section className="surface-card flex flex-col gap-3 p-5 sm:p-6">
              <p className="text-[14.5px] text-muted-foreground">{m.refill.fillerFindsIt}</p>
              <Link href={`/vullen/${sheet.id}`} className={buttonVariants({ size: "lg" })}>
                {m.refill.fillYourself}
              </Link>
            </section>
          )}
          {!sheet.completed_at && !step && sheet.share_token && (
            <section className="surface-card p-5 sm:p-6">
              <h2 className="mb-3 text-[18px] font-semibold tracking-[-0.02em]">{m.refill.share}</h2>
              <ShareBox token={sheet.share_token} />
            </section>
          )}
          {step && (
            <Section title={m.refill.stopsTitle} hint={sheet.started_at ? m.refill.stopsHint : undefined}>
              <RowList>
                {sheet.machine_ids.map((machineId) => {
                  const stop = sheet.stops?.[machineId];
                  // Minutes since the stop before it was done (or since the
                  // start): the drive there and the work at the machine.
                  const doneAt = stop?.completedAt ?? null;
                  const done = doneAt ? new Date(doneAt).getTime() : null;
                  const previous = Object.values(sheet.stops ?? {})
                    .map((other) => (other.completedAt ? new Date(other.completedAt).getTime() : NaN))
                    .filter((at) => done !== null && at < done)
                    .reduce((latest, at) => Math.max(latest, at), -Infinity);
                  const start = sheet.started_at ? new Date(sheet.started_at).getTime() : NaN;
                  const first = !Number.isFinite(previous);
                  const since = first ? start : previous;
                  const gap = done !== null && Number.isFinite(since) ? (done - since) / 60000 : null;
                  const name =
                    machineName.get(machineId) ??
                    sheet.lines.find((line) => line.machine_id === machineId)?.machine_name ??
                    "—";
                  return (
                    <li key={machineId}>
                      <ListRow
                        leading={
                          <Avatar tone={stop?.completedAt ? (stop.skipped ? "warning" : "positive") : "neutral"}>
                            {stop?.completedAt && !stop.skipped ? <CircleCheck /> : initial(name)}
                          </Avatar>
                        }
                        title={name}
                        value={
                          <span className="text-[13.5px] font-medium text-muted-foreground">
                            {stop?.completedAt ? (stop.skipped ? m.refill.stopSkipped : m.refill.stopDone) : m.refill.stopOpen}
                          </span>
                        }
                        valueSub={
                          doneAt && (
                            <span className="tabular text-muted-foreground">
                              {f.time(doneAt)}
                              {gap !== null &&
                                ` · ${fmt(first ? m.refill.stopGapStart : m.refill.stopGap, {
                                  time: duration(gap, m.refill.runTime, m.refill.runTimeHours),
                                })}`}
                            </span>
                          )
                        }
                      />
                    </li>
                  );
                })}
              </RowList>
            </Section>
          )}
          {(minutes !== null || sheet.km !== null || sheet.filled_by) && (
            <Section title={m.refill.runFacts}>
              <dl className="surface-card flex flex-col px-5 py-1">
                {sheet.filled_by && (
                  <div className="flex items-baseline justify-between gap-4 border-b border-border py-3.5 last:border-b-0">
                    <dt className="text-sm text-muted-foreground">{m.refill.filler}</dt>
                    <dd className="text-[15px] font-semibold">{sheet.filled_by}</dd>
                  </div>
                )}
                {minutes !== null && (
                  <div className="flex items-baseline justify-between gap-4 border-b border-border py-3.5 last:border-b-0">
                    <dt className="text-sm text-muted-foreground">{m.refill.duration}</dt>
                    <dd className="tabular text-[15px] font-semibold">
                      {duration(minutes, m.refill.runTime, m.refill.runTimeHours)}
                    </dd>
                  </div>
                )}
                {sheet.km !== null && (
                  <div className="flex items-baseline justify-between gap-4 border-b border-border py-3.5 last:border-b-0">
                    <dt className="text-sm text-muted-foreground">{m.refill.kmLabel}</dt>
                    <dd className="tabular text-[15px] font-semibold">{fmt(m.refill.runKm, { km: sheet.km })}</dd>
                  </div>
                )}
              </dl>
            </Section>
          )}

          {!sheet.completed_at && (
            <Section title={m.refill.boxTitle} hint={m.refill.boxHint}>
              {box.length === 0 ? (
                <p className="px-1 text-sm text-muted-foreground">{m.refill.boxEmpty}</p>
              ) : (
                <RowList>
                  {box.map((row) => (
                    <li key={row.id}>
                      <ListRow leading={<Avatar>{initial(row.name)}</Avatar>} title={row.name} value={String(row.qty)} />
                    </li>
                  ))}
                </RowList>
              )}
            </Section>
          )}

          <Section title={m.refill.notes}>
            <NotesForm sheetId={sheet.id} initialNotes={sheet.notes ?? ""} />
          </Section>
        </div>
      </div>
    </>
  );
}
