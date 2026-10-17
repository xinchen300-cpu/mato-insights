import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CircleCheck, FileSpreadsheet, Printer } from "lucide-react";
import { KpiHero } from "@/components/kpi";
import { Avatar, ListRow, RowList, initial } from "@/components/list-row";
import { PageHeader, Section } from "@/components/page-header";
import { SheetTables, type SheetActual } from "@/components/refill/sheet-tables";
import { buttonVariants } from "@/components/ui/button";
import { duration, fmt } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { LiveRounds } from "@/components/refill/live-rounds";
import { getMachines, getOpenRounds, getRefillSheet, getRoundSettings, getRunRates, getRunSummary, type OpenRound } from "@/lib/data";
import { routeKm } from "@/lib/round-settings";
import type { Machine, RunSummaryRow } from "@/lib/types";
import { linesToFill } from "@/lib/refill";
import { roundActual, roundCost } from "@/lib/refill-flow";
import { isFiller, isOperator, requireOrgId, requireRefillAccess } from "@/lib/org";
import { cn } from "@/lib/utils";
import { CancelRound } from "./cancel-round";
import { NotesForm } from "./notes-form";
import { RoundReport } from "./round-report";
import { RunKm } from "./run-km";
import { RunReport } from "./run-report";
import { ShareBox } from "./share-box";
import { MachineIcon } from "@/components/machine/machine-icon";

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

  // A stop with nothing to fill has no line to borrow a name from.
  const step = sheet.flow_version === 2;
  // A shop follows the round; doing it is for the operator and their fillers.
  const operator = await isOperator();
  const canFill = step && operator;
  const timed = Boolean(sheet.started_at && sheet.completed_at);
  // The rest at once, each loader with its own checks. Only a closed run has
  // something to report; a round out right now gets the same live card as on
  // the overview; the stops need names, and the cost each machine's distance
  // there and back; the cost itself is the operator's, for a closed round.
  const [summary, open, fleet, rates, settings] = await Promise.all([
    sheet.completed_at ? getRunSummary(orgId, sheet.id) : Promise.resolve<RunSummaryRow[]>([]),
    canFill && sheet.started_at && !sheet.completed_at ? getOpenRounds(orgId) : Promise.resolve<OpenRound[]>([]),
    step || (operator && sheet.completed_at) ? getMachines(orgId) : Promise.resolve<Machine[]>([]),
    operator && sheet.completed_at && timed ? getRunRates(orgId) : Promise.resolve(null),
    // The route's distances: what the round drove, added up, for its cost.
    operator && sheet.completed_at ? getRoundSettings(orgId) : Promise.resolve(null),
  ]);
  const live = open.filter((r) => r.id === sheet.id);
  const machineName = new Map(fleet.map((machine) => [machine.id, machine.name]));

  const total = sheet.lines.reduce((sum, l) => sum + l.to_add, 0);

  // A finished step-by-step round reports what really happened, per product
  // and per slot, instead of what was planned.
  const real = roundActual(
    sheet,
    summary.map((row) => ({ productId: row.product_id, qty: row.short })),
  );
  const finished = real !== null;
  const items = real?.items ?? [];
  const actual: SheetActual | undefined = real?.actual;
  const filledTotal = items.reduce((sum, item) => sum + item.filled, 0);

  // The cool box is keyed by product id; the lines know the names.
  const nameOf = new Map(sheet.lines.map((l) => [l.product_id, l.product_name]));
  // Keyed by product id, since two products may share a name, and a product
  // that dropped out of the plan would otherwise render without a name.
  // A product that dropped out of the plan is still in the van, so it stays on
  // the list with a dash for a name. Hiding it would claim an empty cool box.
  // Flow 2 keys the box per machine and product; flow 1 per product.
  const box = Object.entries(sheet.box ?? {})
    .map(([key, qty]) => ({ id: key, name: nameOf.get(step ? key.split(":")[1] : key) ?? m.common.unknown, qty }))
    .sort((a, b) => b.qty - a.qty);

  const minutes =
    sheet.started_at && sheet.completed_at
      ? Math.max(1, Math.round((new Date(sheet.completed_at).getTime() - new Date(sheet.started_at).getTime()) / 60000))
      : null;

  // What the round cost, for the operator only: its time and its kilometres at
  // the rates in Settings, with the sum written out next to it.
  const km = sheet.km === null ? null : Number(sheet.km);
  const cost =
    rates && minutes !== null
      ? roundCost({
          minutes,
          km,
          // Its own stops in the order driven, the skipped ones left out.
          routeKm: settings ? routeKm(sheet.machine_ids.filter((id) => !sheet.stops?.[id]?.skipped), settings.legs) : null,
          machineKm: sheet.machine_ids
            .filter((id) => !sheet.stops?.[id]?.skipped)
            .map((id) => fleet.find((machine) => machine.id === id)?.km_round_trip ?? null),
          ...rates,
        })
      : null;
  const costCalc =
    cost && rates
      ? fmt(
          cost.kmFrom === "round"
            ? m.refill.costCalc
            : cost.kmFrom === "route"
              ? m.refill.costCalcRoute
              : cost.kmFrom === "machine"
                ? m.refill.costCalcMachine
                : m.refill.costCalcNoKm,
          {
            time: duration(cost.minutes, m.refill.runTime, m.refill.runTimeHours),
            perHour: f.euro(rates.perHour),
            km: cost.km === null ? "" : f.number(cost.km),
            perKm: f.euro(rates.perKm),
          },
        )
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
        <KpiHero
          label={finished ? m.refill.filledCol : m.refill.total}
          value={fmt(m.refill.items, { count: finished ? filledTotal : total })}
          f={f}
        />
        {sheet.completed_at && (
          <p className="flex items-center gap-2 text-[15px] font-medium text-positive">
            <CircleCheck className="size-[18px]" />
            {fmt(m.refill.completedAt, { date: f.dateTime(sheet.completed_at) })}
          </p>
        )}
        {cost && costCalc && (
          <div className="mt-6 flex flex-col gap-1">
            <p className="text-[14px] font-medium text-muted-foreground">{m.refill.costTitle}</p>
            <p className="tabular text-[28px] font-semibold leading-tight tracking-[-0.03em]">{f.euro(cost.total)}</p>
            <p className="max-w-xl text-[13.5px] leading-snug text-muted-foreground">
              <span className="tabular">{costCalc}</span>{" "}
              <Link href="/settings" className="font-medium underline underline-offset-2 hover:text-foreground">
                {m.refill.costRates}
              </Link>
            </p>
          </div>
        )}
      </div>

      {live.length > 0 && (
        <div className="mb-10">
          <LiveRounds rounds={live} link="fill" />
        </div>
      )}

      {finished && sheet.completed_at ? (
        <Section title={m.refill.itemReportTitle} hint={m.refill.itemReportHint} className="mb-10">
          <div className="surface-card px-5 py-4 sm:px-6 sm:py-5">
            <RoundReport
              items={items}
              heading={[m.refill.reportTitle, sheet.filled_by, f.dateTime(sheet.completed_at)].filter(Boolean).join(" · ")}
            />
          </div>
        </Section>
      ) : (
        sheet.completed_at && (
          <Section title={m.refill.reportTitle} hint={m.refill.reportHint} className="mb-10">
            <div className="surface-card px-5 py-4 sm:px-6 sm:py-5">
              <RunReport rows={summary} when={f.dateTime(sheet.completed_at)} />
            </div>
          </Section>
        )
      )}

      <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr] lg:gap-8">
        <SheetTables lines={linesToFill(sheet.lines)} m={m} actual={actual} />
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
                    m.common.unknown;
                  return (
                    <li key={machineId}>
                      <ListRow
                        leading={
                          <Avatar tone={stop?.completedAt ? (stop.skipped ? "warning" : "positive") : "neutral"}>
                            {stop?.completedAt && !stop.skipped ? <CircleCheck /> : <MachineIcon />}
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
                              {/* The operator's own checks (Werkwijze): how many were ticked here. */}
                              {stop?.checks &&
                                Object.keys(stop.checks).length > 0 &&
                                ` · ${fmt(m.refill.checksDone, {
                                  done: Object.values(stop.checks).filter(Boolean).length,
                                  total: Object.keys(stop.checks).length,
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
                {(km !== null || (operator && sheet.completed_at)) && (
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border py-3.5 last:border-b-0">
                    <dt className="min-w-0 text-sm text-muted-foreground">{m.refill.kmLabel}</dt>
                    <dd className="ml-auto shrink-0">
                      {operator && sheet.completed_at ? (
                        <RunKm sheetId={sheet.id} km={km} estimate={cost?.kmFrom === "machine" || cost?.kmFrom === "route" ? cost.km : null} />
                      ) : (
                        <span className="tabular text-[15px] font-semibold">{fmt(m.refill.runKm, { km: f.number(km ?? 0) })}</span>
                      )}
                    </dd>
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

          {/* The note goes to whoever fills the round; it is the operator's to write. */}
          {operator && (
            <Section title={m.refill.notes}>
              <NotesForm sheetId={sheet.id} initialNotes={sheet.notes ?? ""} />
            </Section>
          )}
          {operator && !sheet.completed_at && <CancelRound sheetId={sheet.id} />}
        </div>
      </div>
    </>
  );
}
