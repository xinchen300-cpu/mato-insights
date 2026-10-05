import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { EmptyState, PageHeader, Panel } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { fmt } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { getMachines, getMachineStock, getRefillSheets, getShortages, getStatsReport } from "@/lib/data";
import { isOperator, requireOrgId } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";
import { fillLevel, needsAttention } from "@/lib/stock";
import { DISPLAY_TIME_ZONE } from "@/i18n/format";
import { lastFullWeeks } from "@/lib/stats";
import { MachinePicker } from "./machine-picker";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.refill.title };
}

export default async function RefillPage() {
  const { m, f } = await getI18n();
  const orgId = await requireOrgId();
  const [machines, stock, sheets, shortages, { data: org }, weeks] = await Promise.all([
    getMachines(orgId),
    getMachineStock(orgId),
    getRefillSheets(orgId),
    getShortages(orgId),
    createAdminClient().from("organizations").select("cost_per_hour, cost_per_km").eq("id", orgId).maybeSingle(),
    getStatsReport(orgId, { period: "custom", ...lastFullWeeks(4, DISPLAY_TIME_ZONE) }),
  ]);

  // Whole weeks only, so a half week does not drag the average down.
  const perDay = new Map(weeks.by_machine.map((row) => [row.machine_id, row.units / 28]));

  const perHour = Number(org?.cost_per_hour ?? 25);
  const perKm = Number(org?.cost_per_km ?? 0.42);

  // Measured, not guessed: how long a visit to this machine took on earlier
  // runs. A run over several machines is split evenly across them.
  const measured = new Map<string, { minutes: number; runs: number }>();
  for (const sheet of sheets) {
    if (!sheet.started_at || !sheet.completed_at || sheet.machine_ids.length === 0) continue;
    const total = (new Date(sheet.completed_at).getTime() - new Date(sheet.started_at).getTime()) / 60000;
    if (total <= 0 || total > 480) continue;
    const share = total / sheet.machine_ids.length;
    for (const id of sheet.machine_ids) {
      const entry = measured.get(id) ?? { minutes: 0, runs: 0 };
      entry.minutes += share;
      entry.runs += 1;
      measured.set(id, entry);
    }
  }

  // How often a product came up short, and how many pieces in total.
  const shortByProduct = new Map<string, { name: string; times: number; units: number }>();
  for (const s of shortages) {
    const key = s.product_id ?? "?";
    const entry = shortByProduct.get(key) ?? { name: s.product_name ?? "—", times: 0, units: 0 };
    entry.times += 1;
    entry.units += s.qty;
    shortByProduct.set(key, entry);
  }
  const shortList = [...shortByProduct.values()].sort((a, b) => b.units - a.units);

  const perMachine = new Map<
    string,
    { low: number; toAdd: number; value: number; filled: number; capacity: number; priced: number; prices: number; counted: number }
  >();
  for (const s of stock) {
    if (!s.product_id) continue;
    const entry =
      perMachine.get(s.machine_id) ?? { low: 0, toAdd: 0, value: 0, filled: 0, capacity: 0, priced: 0, prices: 0, counted: 0 };
    if (needsAttention(fillLevel(s.stock, s.capacity))) entry.low += 1;
    entry.capacity += s.capacity;
    if (s.price) {
      entry.prices += s.price;
      entry.priced += 1;
    }
    // A slot that was never counted is not an empty slot. Counting it as one
    // would send the operator out for a run that has nothing to gain.
    if (s.stock !== null) {
      entry.counted += 1;
      const missing = s.capacity - s.stock;
      entry.toAdd += missing;
      entry.value += missing * (s.price ?? 0);
      entry.filled += s.stock;
    }
    perMachine.set(s.machine_id, entry);
  }
  // Minutes per visit across the fleet, for a machine that has never been
  // filled through a sheet: better than pretending a visit costs no time.
  const fleetMinutes = [...measured.values()].reduce(
    (acc, t) => ({ minutes: acc.minutes + t.minutes, runs: acc.runs + t.runs }),
    { minutes: 0, runs: 0 },
  );
  const typicalMinutes = fleetMinutes.runs > 0 ? fleetMinutes.minutes / fleetMinutes.runs : null;

  const pickable = machines
    .filter((mc) => perMachine.has(mc.id))
    .map((mc) => {
      const p = perMachine.get(mc.id)!;
      const time = measured.get(mc.id);
      // Only a number we can stand behind. Driving there is never the whole
      // cost — somebody stands at that machine — so a run without any measured
      // time falls back to what a visit takes elsewhere in the fleet, and
      // without even that, no amount is shown at all.
      const minutes = time ? time.minutes / time.runs : typicalMinutes;
      const cost = minutes !== null ? (mc.km_round_trip ?? 0) * perKm + (minutes / 60) * perHour : null;
      // What the machine will be short of in a week, at the pace it has been
      // selling: the answer to "go now, or Thursday?".
      const rate = perDay.get(mc.id) ?? 0;
      const weekAhead = Math.min(p.capacity, Math.round(p.toAdd + rate * 7));
      // A machine that is full today still sells all week, so its week-ahead
      // pieces are worth the average price in it, not nothing.
      const perPiece = p.toAdd > 0 ? p.value / p.toAdd : p.priced > 0 ? p.prices / p.priced : 0;

      return {
        id: mc.id,
        name: mc.name,
        low: p.low > 0,
        hint:
          cost !== null && p.value > 0
            ? fmt(m.refill.worthHint, {
                items: p.toAdd,
                value: f.euro(p.value),
                cost: f.euro(cost),
              })
            : p.counted === 0
              ? m.overview.stockUnknown
              : p.low > 0
                ? fmt(m.overview.slotsLow, { count: p.low })
                : fmt(m.refill.items, { count: p.toAdd }),
        note:
          cost !== null && p.value > 0 && p.value < cost
            ? m.refill.notWorthIt
            : rate > 0 && weekAhead > p.toAdd
              ? fmt(m.refill.forecastWeek, { items: weekAhead, value: f.euro(weekAhead * perPiece) })
              : undefined,
      };
    });

  const machineName = new Map(machines.map((mc) => [mc.id, mc.name]));

  return (
    <>
      <PageHeader title={m.refill.title} subtitle={m.refill.subtitle} />

      <div className="flex flex-col gap-8">
        {!(await isOperator()) ? (
          <p className="max-w-[60ch] text-sm text-muted-foreground">{m.refill.operatorOnly}</p>
        ) : pickable.length === 0 ? (
          <EmptyState
            title={m.machines.noLayout}
            hint={m.machines.noLayoutHint}
            action={
              <Link href="/machines" className={buttonVariants()}>
                {m.nav.machines}
              </Link>
            }
          />
        ) : (
          <MachinePicker machines={pickable} />
        )}

        <Panel title={m.refill.recent}>
          {sheets.length === 0 ? (
            <p className="text-sm text-muted-foreground">{m.refill.recentEmpty}</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {sheets.map((sheet) => {
                const total = sheet.lines.reduce((sum, l) => sum + l.to_add, 0);
                // The clock runs from the moment the filler opened the sheet.
                const minutes =
                  sheet.started_at && sheet.completed_at
                    ? Math.max(
                        1,
                        Math.round(
                          (new Date(sheet.completed_at).getTime() - new Date(sheet.started_at).getTime()) / 60000,
                        ),
                      )
                    : null;
                return (
                  <li key={sheet.id}>
                    <Link href={`/refill/${sheet.id}`} className="flex items-center justify-between gap-4 py-3">
                      <span className="min-w-0">
                        <span className="block font-semibold">{f.dateTime(sheet.created_at)}</span>
                        <span className="block truncate text-sm text-muted-foreground">
                          {[
                            sheet.machine_ids.map((id) => machineName.get(id)).filter(Boolean).join(", "),
                            sheet.filled_by,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
                        {minutes !== null && <span className="tabular">{fmt(m.refill.runTime, { minutes })}</span>}
                        {sheet.km !== null && <span className="tabular">{fmt(m.refill.runKm, { km: sheet.km })}</span>}
                        <span className="tabular">{fmt(m.refill.items, { count: total })}</span>
                        {sheet.completed_at ? (
                          <CircleCheck className="size-4 text-positive" />
                        ) : (
                          sheet.started_at && <span className="text-xs font-semibold text-warning">{m.refill.runOpen}</span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title={m.refill.shortagesTitle} hint={m.refill.shortagesHint}>
          {shortList.length === 0 ? (
            <p className="text-sm text-muted-foreground">{m.refill.shortagesEmpty}</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {shortList.map((row) => (
                <li key={row.name} className="flex items-baseline justify-between gap-4 py-3">
                  <span className="min-w-0 truncate font-semibold">{row.name}</span>
                  <span className="tabular shrink-0 text-sm text-muted-foreground">
                    {fmt(m.refill.shortagesTimes, { count: row.times, units: row.units })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
