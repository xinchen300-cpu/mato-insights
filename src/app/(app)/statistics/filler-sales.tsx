import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import { HourChart } from "@/components/charts/lazy";
import { Avatar } from "@/components/list-row";
import { MachineIcon } from "@/components/machine/machine-icon";
import { PageHeader, Panel, Section } from "@/components/page-header";
import { DISPLAY_TIME_ZONE, duration, fmt, type Formatters } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import type { Messages } from "@/i18n/messages";
import { getMachines, getMyRounds, getSoldReport, type SoldReport } from "@/lib/data";
import { lastMonths, monthDays, roundsByMonth, type MonthOfRounds } from "@/lib/filler-stats";
import { reportDay } from "@/lib/stats";
import { cn } from "@/lib/utils";

/**
 * What sells and how the rounds went, for whoever fills (Xin, 17 and
 * 19-10-2026): the best-selling machines and the busiest hours, then their own
 * rounds month by month with the times, the machines, the pieces and the
 * busiest fill day. The last three calendar months, or one of them. No euros
 * anywhere: the report comes without them.
 */
export async function FillerSales({ orgId, month }: { orgId: string; month?: string }) {
  const { m, f } = await getI18n();
  const months = lastMonths(3, DISPLAY_TIME_ZONE);
  const chosen = month && months.includes(month) ? month : null;
  const days = chosen
    ? monthDays(chosen)
    : { from: monthDays(months[months.length - 1]).from, to: reportDay(new Date(), DISPLAY_TIME_ZONE) };
  const [report, rounds, machines] = await Promise.all([getSoldReport(orgId, days), getMyRounds(orgId), getMachines(orgId)]);
  const byMonth = roundsByMonth(rounds, chosen ? [chosen] : months, DISPLAY_TIME_ZONE);
  // Only the names of machines on this person's own rounds go to the page.
  const onRounds = new Set(byMonth.flatMap((each) => each.rounds.flatMap((round) => round.machineIds)));
  const names = Object.fromEntries(machines.filter((machine) => onRounds.has(machine.id)).map((machine) => [machine.id, machine.name]));
  return <SoldView report={report} byMonth={byMonth} months={months} chosen={chosen} names={names} m={m} f={f} />;
}

const capital = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1);

/** The page itself, from a report that has no amounts in it. */
export function SoldView({
  report,
  byMonth,
  months,
  chosen,
  names,
  m,
  f,
}: {
  report: SoldReport;
  byMonth: MonthOfRounds[];
  months: string[];
  /** One month, or null for all of them. */
  chosen: string | null;
  names: Record<string, string>;
  m: Messages;
  f: Formatters;
}) {
  const t = m.stats;
  const top = report.machines[0]?.units ?? 0;

  return (
    <>
      <PageHeader title={m.nav.sales} subtitle={chosen ? capital(f.monthLongYear(chosen)) : t.soldLast3} />
      <div className="flex flex-col gap-8">
        <nav aria-label={t.soldPeriod} className="-mx-1 -mt-2 flex gap-2 overflow-x-auto px-1 pb-1">
          {[null, ...months].map((option) => (
            <Link
              key={option ?? "all"}
              href={option ? `/statistics?month=${option}` : "/statistics"}
              aria-current={option === chosen ? "page" : undefined}
              className={cn(
                "inline-flex h-11 shrink-0 items-center rounded-full px-3.5 text-[15px] font-semibold transition-colors active:scale-[0.98]",
                option === chosen ? "bg-foreground text-background" : "border border-border bg-card text-foreground",
              )}
            >
              {option ? capital(f.monthLong(option)) : t.soldAll}
            </Link>
          ))}
        </nav>

        <Section title={t.soldBestMachines}>
          {report.machines.length === 0 ? (
            <p className="surface-card px-5 py-5 text-sm text-muted-foreground">{t.noSales}</p>
          ) : (
            // An ordered list: the order is the point, the bars show how far apart.
            <ol className="surface-card flex flex-col p-2">
              {report.machines.map((row, i) => (
                <li key={row.machineId} className="flex items-center gap-3 rounded-xl px-3 py-3">
                  <span className="tabular-nums w-4 shrink-0 text-center text-[13px] font-semibold text-muted-foreground">{i + 1}</span>
                  <Avatar>
                    <MachineIcon />
                  </Avatar>
                  {/* The whole name, then its bar against the best one: a graph, no numbers (Xin, 19-10-2026). */}
                  <span className="flex min-w-0 flex-1 flex-col gap-2">
                    <span className="text-[15px] font-semibold leading-snug tracking-[-0.01em]">{row.name}</span>
                    <span className="block h-3 overflow-hidden rounded-full bg-border/70" aria-hidden="true">
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(4, (row.units / top) * 100)}%` }} />
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Section>

        <Panel title={t.busiestHours}>
          <HourChart data={report.hours} measure="units" />
        </Panel>

        <Section title={t.soldRounds}>
          <div className="flex flex-col gap-4">
            {byMonth.map((month) => (
              <MonthCard key={month.month} month={month} names={names} m={m} f={f} />
            ))}
          </div>
        </Section>
      </div>
    </>
  );
}

/** One month of rounds: the totals, the busiest fill day, then every round with its times. */
function MonthCard({ month, names, m, f }: { month: MonthOfRounds; names: Record<string, string>; m: Messages; f: Formatters }) {
  const t = m.stats;
  const time = (minutes: number) => duration(minutes, m.refill.runTime, m.refill.runTimeHours);
  return (
    <section className="surface-card flex flex-col gap-4 p-4 sm:p-5">
      <h3 className="text-[17px] font-semibold tracking-[-0.01em]">{capital(f.monthLongYear(month.month))}</h3>
      {month.rounds.length === 0 ? (
        <p className="text-[15px] text-muted-foreground">{fmt(t.soldNoRounds, { month: f.monthLong(month.month) })}</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Figure label={t.soldRoundsCount} value={f.number(month.rounds.length)} />
            <Figure label={t.soldMachines} value={f.number(month.visits)} />
            <Figure label={t.soldItems} value={f.number(month.items)} />
            <Figure label={t.soldTime} value={month.minutes > 0 ? time(month.minutes) : "–"} />
          </dl>
          {month.busiest && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-xl bg-primary/12 px-3.5 py-2.5 text-[15px]">
              <CalendarCheck className="size-[18px] shrink-0 text-gold-ink" aria-hidden="true" />
              <span className="font-semibold">{t.soldBusiest}</span>
              <span>{fmt(t.soldBusiestValue, { day: f.weekdayDay(month.busiest.day), items: f.number(month.busiest.items) })}</span>
            </p>
          )}
          <ul className="flex flex-col divide-y divide-border/60">
            {month.rounds.map((round) => (
              <li key={round.id} className="flex flex-col gap-1 py-3 first:pt-1 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[15.5px] font-semibold first-letter:uppercase">{f.weekdayDay(round.completedAt)}</span>
                  {round.minutes !== null && <span className="tabular-nums shrink-0 text-[15.5px] font-semibold">{time(round.minutes)}</span>}
                </div>
                <div className="flex items-baseline justify-between gap-3 text-[13.5px] text-muted-foreground">
                  <span>
                    {round.visited === 1
                      ? fmt(m.me.recentSubOne, { items: f.number(round.items) })
                      : fmt(m.me.recentSub, { machines: round.visited, items: f.number(round.items) })}
                    {round.skipped > 0 && ` · ${fmt(m.me.skippedTag, { n: round.skipped })}`}
                  </span>
                  <span className="tabular-nums shrink-0">
                    {fmt(t.soldRoundTimes, { start: f.time(round.readyAt), end: f.time(round.completedAt) })}
                  </span>
                </div>
                {round.machineIds.some((id) => names[id]) && (
                  <p className="text-[13px] leading-snug text-muted-foreground/90">
                    {round.machineIds
                      .map((id) => names[id])
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl bg-surface px-3 py-2.5">
      <dt className="text-[12.5px] font-medium leading-tight text-muted-foreground">{label}</dt>
      <dd className="tabular-nums text-[20px] font-semibold tracking-[-0.02em]">{value}</dd>
    </div>
  );
}
