import { ChevronRight } from "lucide-react";
import { Section } from "@/components/page-header";
import { fmt, type Formatters } from "@/i18n/format";
import type { Messages } from "@/i18n/messages";
import type { RefillVisit } from "@/lib/data";
import { isoDay } from "@/lib/expiry";

/** Visits shown before the rest folds away. */
const VISITS_SHOWN = 20;

/**
 * Every time a machine was filled in the period, newest first, under a heading
 * per day with how often and how many pieces that day: when, how many and at
 * what time (Xin, 20-10-2026). A fill through Voorraad aanpassen says so (21-10-2026).
 */
export function RefillLog({
  visits,
  names,
  m,
  f,
}: {
  visits: RefillVisit[];
  names: Map<string, string>;
  m: Messages;
  f: Formatters;
}) {
  // Newest day first; within a day from the first fill to the last, as the round went.
  const days = new Map<string, RefillVisit[]>();
  for (const visit of [...visits].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))) {
    const day = isoDay(new Date(visit.at));
    days.set(day, [...(days.get(day) ?? []), visit]);
  }
  for (const [day, list] of days) days.set(day, list.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)));
  const rows = (list: RefillVisit[]) =>
    [...days].flatMap(([day, dayVisits]) => {
      const shown = dayVisits.filter((visit) => list.includes(visit));
      if (shown.length === 0) return [];
      const pieces = dayVisits.reduce((sum, visit) => sum + visit.pieces, 0);
      return [
        <li key={day} className="flex items-baseline justify-between gap-3 px-3 pb-1 pt-4 first:pt-2">
          <span className="text-[14px] font-semibold">{f.weekdayDay(`${day}T12:00:00Z`)}</span>
          <span className="tabular text-[13px] text-muted-foreground">
            {fmt(m.stats.refillsDay, { visits: dayVisits.length, pieces })}
          </span>
        </li>,
        ...shown.map((visit) => (
          <li key={`${visit.machineId}-${visit.at}`} className="flex min-h-12 items-center gap-3 rounded-xl px-3 py-2">
            <span className="tabular w-12 shrink-0 text-[15px] font-semibold">{f.time(visit.at)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium">{names.get(visit.machineId) ?? m.common.unknown}</span>
              {(visit.by || visit.adjusted) && (
                <span className="block truncate text-[12.5px] text-muted-foreground">
                  {[visit.by && fmt(m.stats.refillBy, { name: visit.by }), visit.adjusted && m.stats.refillAdjusted].filter(Boolean).join(" · ")}
                </span>
              )}
            </span>
            <span className="tabular shrink-0 text-[15px] font-semibold">{fmt(m.stats.refillPieces, { n: visit.pieces })}</span>
          </li>
        )),
      ];
    });
  const newest = [...visits].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const first = newest.slice(0, VISITS_SHOWN);
  const rest = newest.slice(VISITS_SHOWN);
  return (
    <Section title={m.stats.refillsTitle} hint={m.stats.refillsHint}>
      <ul className="surface-card flex flex-col p-2">{rows(first)}</ul>
      {rest.length > 0 && (
        <details className="group">
          <summary className="flex h-11 cursor-pointer list-none items-center gap-1.5 px-1 text-[14.5px] font-semibold text-muted-foreground [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden="true" />
            {fmt(m.stats.refillsMore, { n: rest.length })}
          </summary>
          <ul className="surface-card flex flex-col p-2">{rows(rest)}</ul>
        </details>
      )}
    </Section>
  );
}
