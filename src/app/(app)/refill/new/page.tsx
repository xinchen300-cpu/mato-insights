import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { DISPLAY_TIME_ZONE, fmt } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { getMachines, getMachineStock, getOpenRounds, getRefillSheets, getStatsReport } from "@/lib/data";
import { denyFiller, isOperator, requireOrgId } from "@/lib/org";
import { cleanRoundSettings, orderByRoute } from "@/lib/round-settings";
import { lastFullWeeks } from "@/lib/stats";
import { fillLevel, needsAttention } from "@/lib/stock";
import { createAdminClient } from "@/lib/supabase/admin";
import { MachinePicker } from "../machine-picker";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.refill.newRound };
}

/**
 * A new round, for the operator: the machines in route order, the ones that
 * need it ticked, and per machine what a visit is worth against what it
 * costs. Its own page, so Bijvullen itself is about the rounds.
 */
export default async function NewRoundPage() {
  await denyFiller();
  if (!(await isOperator())) redirect("/refill");
  const { m, f } = await getI18n();
  const orgId = await requireOrgId();
  const window = lastFullWeeks(4, DISPLAY_TIME_ZONE);
  // All at once, each loader with its own checks.
  const [openRounds, machines, stock, sheets, { data: org }, weeks] = await Promise.all([
    getOpenRounds(orgId),
    getMachines(orgId),
    getMachineStock(orgId),
    getRefillSheets(orgId),
    createAdminClient().from("organizations").select("cost_per_hour, cost_per_km, refill_settings").eq("id", orgId).maybeSingle(),
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


  return (
    <>
      <PageHeader backHref="/refill" backLabel={m.refill.title} title={m.refill.newRound} subtitle={m.refill.newRoundHint} />
      {pickable.length === 0 ? (
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
        // In route order; the owner puts the round in order here, and that becomes the route.
        <MachinePicker
          machines={orderByRoute(pickable.map((p) => p.id), cleanRoundSettings(org?.refill_settings).route).map(
            (id) => pickable.find((p) => p.id === id)!,
          )}
          canOrder
        />
      )}
    </>
  );
}

/** Machines already on a round that is not finished: not ticked again by themselves. */
function onOpenRound(rounds: Awaited<ReturnType<typeof getOpenRounds>>): Set<string> {
  return new Set(rounds.flatMap((round) => round.machines.filter((machine) => !machine.done).map((machine) => machine.id)));
}
