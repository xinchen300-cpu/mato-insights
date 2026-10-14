import Link from "next/link";
import { CircleCheck, ClipboardList } from "lucide-react";
import { Avatar, ListRow, RowList, initial } from "@/components/list-row";
import { EmptyState, PageHeader, Section } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { duration, fmt } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { getMachines, getMachineStock, getOpenRounds, getRefillSheets, getShortages, getStatsReport, type OpenRound } from "@/lib/data";
import { LiveRounds } from "@/components/refill/live-rounds";
import { RefillTabs } from "@/components/refill/refill-tabs";
import { isFiller, isOperator, requireOrgId, requireRefillAccess } from "@/lib/org";
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
  // A filler gets their own view of the refill work: rounds and pieces, no money.
  if (await isFiller()) {
    const fillerOrg = await requireRefillAccess();
    const [rounds, fleet, slots] = await Promise.all([
      getOpenRounds(fillerOrg),
      getMachines(fillerOrg),
      getMachineStock(fillerOrg),
    ]);
    const pieces = new Map<string, { toAdd: number; counted: number; low: number }>();
    for (const slot of slots) {
      if (!slot.product_id) continue;
      const entry = pieces.get(slot.machine_id) ?? { toAdd: 0, counted: 0, low: 0 };
      if (needsAttention(fillLevel(slot.stock, slot.capacity))) entry.low += 1;
      if (slot.stock !== null) {
        entry.counted += 1;
        entry.toAdd += slot.capacity - slot.stock;
      }
      pieces.set(slot.machine_id, entry);
    }
    const busy = onOpenRound(rounds);
    const choices = fleet
      .filter((mc) => pieces.has(mc.id))
      .map((mc) => {
        const p = pieces.get(mc.id)!;
        return {
          id: mc.id,
          name: mc.name,
          low: p.low > 0 && !busy.has(mc.id),
          hint: p.counted === 0 ? m.overview.stockUnknown : fmt(m.refill.items, { count: p.toAdd }),
          note: busy.has(mc.id) ? m.refill.onOpenRound : undefined,
        };
      });
    return (
      <>
        <PageHeader title={m.refill.title} />
        <div className="flex flex-col gap-10">
          <OpenRounds rounds={rounds} m={m} f={f} />
          {choices.length > 0 ? (
            <MachinePicker machines={choices} />
          ) : (
            <EmptyState title={m.team.fillerWelcome} hint={m.team.fillerWelcomeHint} icon={<ClipboardList className="size-5" />} />
          )}
        </div>
      </>
    );
  }
  const orgId = await requireOrgId();
  const openRounds = (await isOperator()) ? await getOpenRounds(orgId) : [];
  const window = lastFullWeeks(4, DISPLAY_TIME_ZONE);
  const [machines, stock, sheets, shortages, { data: org }, weeks] = await Promise.all([
    getMachines(orgId),
    getMachineStock(orgId),
    getRefillSheets(orgId),
    getShortages(orgId),
    createAdminClient().from("organizations").select("cost_per_hour, cost_per_km").eq("id", orgId).maybeSingle(),
    getStatsReport(orgId, { period: "custom", ...window }),
  ]);

  // Whole weeks only, so a half week does not drag the average down, and per
  // day the machine was selling: one that started two weeks ago is not half as
  // busy. At least a week, so a few first days do not make a pace.
  const dayMs = 86_400_000;
  const windowStart = Date.parse(`${window.from}T00:00:00Z`);
  const windowEnd = Date.parse(`${window.to}T00:00:00Z`) + dayMs;
  const perDay = new Map(
    weeks.by_machine.map((row) => {
      const since = row.first_sale ? Math.max(windowStart, Date.parse(row.first_sale)) : windowStart;
      return [row.machine_id, row.units / Math.max(7, (windowEnd - since) / dayMs)];
    }),
  );

  const perHour = Number(org?.cost_per_hour ?? 25);
  const perKm = Number(org?.cost_per_km ?? 0.42);

  // Measured, not guessed: how long a visit to this machine took on earlier
  // runs. A run over several machines is split evenly across the ones that
  // were visited; a skipped machine took no time.
  const measured = new Map<string, { minutes: number; runs: number }>();
  for (const sheet of sheets) {
    const visited = sheet.machine_ids.filter((id) => !sheet.stops?.[id]?.skipped);
    if (!sheet.started_at || !sheet.completed_at || visited.length === 0) continue;
    const total = (new Date(sheet.completed_at).getTime() - new Date(sheet.started_at).getTime()) / 60000;
    if (total <= 0 || total > 480) continue;
    const share = total / visited.length;
    for (const id of visited) {
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
    const entry = shortByProduct.get(key) ?? { name: s.product_name ?? m.common.unknown, times: 0, units: 0 };
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
  const busy = onOpenRound(openRounds);

  const pickable = machines
    .filter((mc) => perMachine.has(mc.id))
    .map((mc) => {
      const p = perMachine.get(mc.id)!;
      const time = measured.get(mc.id);
      // Only a number we can stand behind. Driving there is never the whole
      // cost — somebody stands at that machine — so a run without any measured
      // time falls back to what a visit takes elsewhere in the fleet, and
      // without even that, no amount is shown at all.
      // Without a distance the drive is unknown, not free: then no amount either.
      const minutes = time ? time.minutes / time.runs : typicalMinutes;
      const cost = minutes !== null && mc.km_round_trip !== null ? mc.km_round_trip * perKm + (minutes / 60) * perHour : null;
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
        low: p.low > 0 && !busy.has(mc.id),
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
        note: busy.has(mc.id)
          ? m.refill.onOpenRound
          : cost !== null && p.value > 0 && p.value < cost
            ? m.refill.notWorthIt
            : rate > 0 && weekAhead > p.toAdd
              ? fmt(m.refill.forecastWeek, { items: weekAhead, value: f.euro(weekAhead * perPiece) })
              : undefined,
      };
    });

  const machineName = new Map(machines.map((mc) => [mc.id, mc.name]));

  const operator = await isOperator();
  return (
    <>
      <PageHeader title={m.refill.title} actions={operator ? <RefillTabs active="rounds" m={m} /> : undefined} />

      <div className="flex flex-col gap-10">
        <LiveRounds rounds={openRounds} />
        {!operator ? (
          <p className="max-w-[60ch] px-1 text-[15px] text-muted-foreground">{m.refill.operatorOnly}</p>
        ) : pickable.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="size-5" />}
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

        <Section title={m.refill.recent}>
          {sheets.length === 0 ? (
            <p className="px-1 text-sm text-muted-foreground">{m.refill.recentEmpty}</p>
          ) : (
            <RowList>
              {sheets.map((sheet) => {
                // A finished step-by-step round counts what went in, not what was planned.
                const total =
                  sheet.flow_version === 2 && sheet.completed_at
                    ? Object.values(sheet.stops ?? {}).reduce((sum, stop) => sum + stop.lines.reduce((s, l) => s + l.filled, 0), 0)
                    : sheet.lines.reduce((sum, l) => sum + l.to_add, 0);
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
                const open = !sheet.completed_at && Boolean(sheet.started_at);
                return (
                  <li key={sheet.id}>
                    <ListRow
                      href={`/refill/${sheet.id}`}
                      leading={
                        sheet.completed_at ? (
                          <Avatar tone="positive">
                            <CircleCheck />
                          </Avatar>
                        ) : (
                          <Avatar tone={open ? "warning" : "neutral"}>
                            <ClipboardList />
                          </Avatar>
                        )
                      }
                      title={f.dateTime(sheet.created_at)}
                      subtitle={[
                        sheet.machine_ids.map((id) => machineName.get(id)).filter(Boolean).join(", "),
                        sheet.filled_by,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      value={fmt(m.refill.items, { count: total })}
                      valueSub={
                        (minutes !== null || sheet.km !== null || open) && (
                          <span className="ml-auto flex max-w-28 flex-wrap items-center justify-end gap-x-2 gap-y-0.5 text-muted-foreground sm:max-w-none">
                            {minutes !== null && (
                              <span className="tabular">{duration(minutes, m.refill.runTime, m.refill.runTimeHours)}</span>
                            )}
                            {sheet.km !== null && <span className="tabular">{fmt(m.refill.runKm, { km: f.number(Number(sheet.km)) })}</span>}
                            {open && (
                              <span className="inline-flex items-center gap-1.5 font-medium text-warning">
                                <span className="size-1.5 rounded-full bg-warning" aria-hidden="true" />
                                {m.refill.runOpen}
                              </span>
                            )}
                          </span>
                        )
                      }
                      chevron
                    />
                  </li>
                );
              })}
            </RowList>
          )}
        </Section>

        <Section title={m.refill.shortagesTitle} hint={m.refill.shortagesHint}>
          {shortList.length === 0 ? (
            <p className="px-1 text-sm text-muted-foreground">{m.refill.shortagesEmpty}</p>
          ) : (
            <RowList>
              {shortList.map((row) => (
                <li key={row.name}>
                  <ListRow
                    leading={<Avatar>{initial(row.name)}</Avatar>}
                    title={row.name}
                    subtitle={
                      <span className="tabular">{fmt(m.refill.shortagesTimes, { count: row.times, units: row.units })}</span>
                    }
                  />
                </li>
              ))}
            </RowList>
          )}
        </Section>
      </div>
    </>
  );
}

/** Rounds started but not finished: tap to carry on filling. */
function OpenRounds({
  rounds,
  m,
  f,
}: {
  rounds: OpenRound[];
  m: Awaited<ReturnType<typeof getI18n>>["m"];
  f: Awaited<ReturnType<typeof getI18n>>["f"];
}) {
  if (rounds.length === 0) return null;
  return (
    <Section title={m.refill.openRounds}>
      <RowList>
        {rounds.map((round) => (
          <li key={round.id}>
            <ListRow
              href={`/vullen/${round.id}`}
              leading={
                <Avatar tone={round.readyAt ? "warning" : "neutral"}>
                  <ClipboardList />
                </Avatar>
              }
              title={f.dateTime(round.createdAt)}
              subtitle={round.machines.map((machine) => machine.name).join(", ")}
              value={fmt(m.refill.roundProgress, {
                done: round.machines.filter((machine) => machine.done).length,
                total: round.machines.length,
              })}
              valueSub={<span className="text-muted-foreground">{round.readyAt ? m.refill.roundUnderway : m.refill.roundPicking}</span>}
              chevron
            />
          </li>
        ))}
      </RowList>
    </Section>
  );
}

/** Machines that a round still open will fill: a second round for them would fill them twice. */
function onOpenRound(rounds: OpenRound[]): Set<string> {
  return new Set(rounds.flatMap((round) => round.machines.filter((machine) => !machine.done).map((machine) => machine.id)));
}
