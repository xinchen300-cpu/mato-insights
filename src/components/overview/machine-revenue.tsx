"use client";

import { useState } from "react";
import Link from "next/link";
import { Delta } from "@/components/delta";
import { MachinePhoto } from "@/components/machine/machine-photo";
import { StatusDot } from "@/components/machine/status-badge";
import { useI18n } from "@/i18n/client";
import { fmt, plural } from "@/i18n/format";
import { PERIODS, type PeriodKey, type RevenueFigure, type RevenueMachine } from "@/lib/overview";
import { refilledText } from "@/lib/refilled";
import { bandBg } from "@/lib/stock";
import { cn } from "@/lib/utils";

/**
 * Revenue machine by machine (Xin, 19-10-2026: "omzet per automaat instead of
 * a total"), for today, this week or this month. Each machine with its money,
 * its pieces, the change that is real, how full it is and when it was last
 * filled; the total is one line above them. A bar shows each against the best.
 */
export function MachineRevenue({ machines, totals }: { machines: RevenueMachine[]; totals: Record<PeriodKey, RevenueFigure> }) {
  const { m, f } = useI18n();
  const t = m.overview;
  const [period, setPeriod] = useState<PeriodKey>("today");
  const label: Record<PeriodKey, string> = { today: m.periods.today, week: m.periods.week, month: m.periods.month };
  const compare: Record<PeriodKey, string> = {
    today: m.periods.compareToday,
    week: m.periods.compareWeek,
    month: m.periods.compareMonth,
  };
  const rows = [...machines].sort(
    (a, b) => b.figures[period].revenue - a.figures[period].revenue || a.name.localeCompare(b.name),
  );
  const best = Math.max(0, ...rows.map((row) => row.figures[period].revenue));
  const total = totals[period];

  return (
    <section className="surface-card flex flex-col p-2 sm:p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-2 pt-2">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em]">{t.byMachine}</h2>
        <div role="tablist" aria-label={t.byMachine} className="flex rounded-full bg-surface p-1">
          {PERIODS.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={period === key}
              onClick={() => setPeriod(key)}
              className={cn(
                "h-9 rounded-full px-3.5 text-[14px] font-semibold transition-colors",
                period === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              {key === "today" ? t.today : key === "week" ? t.weekShort : t.monthShort}
            </button>
          ))}
        </div>
      </div>

      {/* All machines together, as one line: the machines below are the point. */}
      <div className="mx-1 mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl bg-surface/70 px-3 py-2.5">
        <span className="text-[13.5px] font-medium text-muted-foreground">{fmt(t.together, { period: label[period].toLowerCase() })}</span>
        <span className="tabular text-[20px] font-bold tracking-[-0.02em]">{f.euro(total.revenue)}</span>
        <span className="tabular text-[13.5px] text-muted-foreground">{plural(total.units, m.common.salesOne, m.common.salesOther)}</span>
        <span className="flex items-center gap-1.5 text-[13px]">
          <Delta
            current={total.revenue}
            previous={total.prevRevenue}
            f={f}
            verdict={total.verdict}
            noiseLabel={m.stats.withinNoise}
            sameLabel={m.stats.aboutSame}
            newLabel={total.newLabel}
            className="text-[13px]"
          />
          {total.verdict !== "tooFew" && total.verdict !== "new" && total.prevRevenue > 0 && (
            <span className="text-muted-foreground">{compare[period]}</span>
          )}
        </span>
      </div>

      <ul className="flex flex-col">
        {rows.map((row) => {
          const figure = row.figures[period];
          return (
            <li key={row.id}>
              <Link href={`/machines/${row.id}`} className="hover-surface flex items-start gap-3 rounded-xl px-2 py-3 sm:px-3">
                <span className="relative w-14 shrink-0 overflow-hidden rounded-xl sm:w-20">
                  <MachinePhoto path={row.photoPath}>
                    <span className="absolute left-1 top-1 grid size-4 place-items-center rounded-full bg-card/90">
                      <StatusDot status={row.status} />
                    </span>
                  </MachinePhoto>
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  {/* The name may take two lines: on a phone it is what the row is about. */}
                  <span className="flex items-start justify-between gap-3">
                    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[15.5px] font-semibold leading-tight tracking-[-0.01em]">{row.name}</span>
                      {row.fill && (
                        <span className={cn("tabular shrink-0 rounded-full px-1.5 py-0.5 text-[11.5px] font-bold text-white", bandBg[row.fill.band])}>
                          {row.fill.percent}%
                        </span>
                      )}
                    </span>
                    <span className="tabular shrink-0 text-[16px] font-semibold leading-tight">{f.euro(figure.revenue)}</span>
                  </span>
                  {/* Against the best machine of the period, so the order reads at a glance. */}
                  <span className="h-1.5 w-full overflow-hidden rounded-full bg-surface" aria-hidden="true">
                    <span
                      className="block h-full rounded-full bg-foreground/75 transition-[width] duration-300"
                      style={{ width: `${best > 0 ? Math.max(2, (figure.revenue / best) * 100) : 0}%` }}
                    />
                  </span>
                  <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                    <span className="text-[12.5px] leading-snug text-muted-foreground">
                      {[
                        plural(figure.units, m.common.salesOne, m.common.salesOther),
                        ...(row.late ? [t.lateSales] : []),
                        // Filled on a round still open: the % above is from before it, until the round is completed.
                        ...(row.onRound ? [m.refill.filledOnRound] : row.lastRefill ? [refilledText(row.lastRefill.at, t, f)] : []),
                      ].join(" · ")}
                    </span>
                    {/* Per machine only a real change speaks; normal swing stays quiet here (the total says it). */}
                    <Delta
                      current={figure.revenue}
                      previous={figure.prevRevenue}
                      f={f}
                      verdict={figure.verdict}
                      noiseLabel={m.stats.withinNoise}
                      newLabel={figure.newLabel}
                      className="text-[12.5px]"
                    />
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
