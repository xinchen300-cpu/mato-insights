import Link from "next/link";
import { Suspense } from "react";
import { ChevronRight, ClipboardList, ListChecks } from "lucide-react";
import { FiguresCard, HowItWorks } from "@/components/filler/figures";
import { Avatar, ListRow, RowList, initial } from "@/components/list-row";
import { EmptyState, PageHeader, Section } from "@/components/page-header";
import { fmt } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { getLiveSold, getMachines, getMachineStock, getMyRounds, getOpenRounds, getRefillSheets, getRoundSettings, getShortages, type OpenRound } from "@/lib/data";
import { orderByRoute } from "@/lib/round-settings";
import { cleanLook } from "@/lib/avatar";
import { fillerStats } from "@/lib/filler-stats";
import { displayName } from "@/lib/people";
import { createClient } from "@/lib/supabase/server";
import { LiveRounds } from "@/components/refill/live-rounds";
import { NextRound } from "@/components/refill/next-round";
import { RoundList } from "@/components/refill/round-list";
import { RefillTabs } from "@/components/refill/refill-tabs";
import { isFiller, isOperator, requireOrgId, requireRefillAccess } from "@/lib/org";
import { fillLevel, filledByVendly, needsAttention, slotsFilledByVendly } from "@/lib/stock";
import { LiveSold } from "@/components/filler/live-sold";
import { MachineGrid, gridMachines } from "@/components/filler/machine-grid";
import { DISPLAY_TIME_ZONE } from "@/i18n/format";
import { MachinePicker } from "./machine-picker";
import { StartRound } from "./list/start-round";
import { InstallApp } from "@/components/install-app";
import { DeleteRounds, type DeletableRound } from "@/components/refill/delete-rounds";
import { filledOnOpenRound, heldByOpenRound, ownRound, startable } from "@/lib/refill-start";
import { machineMap, type MapMachine } from "@/lib/machine-map";
import { MachineMap } from "@/components/refill/machine-map";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Machine } from "@/lib/types";
import type { GridMachine } from "@/components/filler/machine-grid";

export async function generateMetadata() {
  const { m } = await getI18n();
  // A filler knows this page as Home. Who is looking is read after the same check the page makes.
  const orgId = await requireRefillAccess().catch(() => null);
  return { title: orgId && (await isFiller()) ? m.nav.home : m.refill.title };
}

export default async function RefillPage() {
  const { m, f } = await getI18n();
  // A filler gets their own view of the refill work: rounds and pieces, no money.
  if (await isFiller()) {
    const fillerOrg = await requireRefillAccess();
    const [rounds, everyMachine, everySlot, mine, me, settings, sold] = await Promise.all([
      getOpenRounds(fillerOrg),
      getMachines(fillerOrg),
      getMachineStock(fillerOrg),
      getMyRounds(fillerOrg),
      createClient().then((client) => client.auth.getUser()),
      getRoundSettings(fillerOrg),
      getLiveSold(fillerOrg),
    ]);
    // A machine filled by hand is not this screen's work: no tile, no round, no start button.
    const fleet = filledByVendly(everyMachine);
    const slots = slotsFilledByVendly(everySlot, everyMachine);
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
    const busy = heldByOpenRound(rounds);
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
    // Every machine as a tile, in the owner's route order: its photo, how full it is, and online or not.
    const grid = gridMachines(fleet, slots, settings.route, { onRound: filledOnOpenRound(rounds) });
    const stats = fillerStats(mine, DISPLAY_TIME_ZONE);
    const name = displayName(me.data.user);
    // The round to do now, big at the top: one already under way first, else the newest.
    const next = rounds.find((round) => round.readyAt) ?? rounds[0] ?? null;
    return (
      <>
        <PageHeader title={name ? fmt(m.round.hello, { name }) : m.refill.title} />
        <div className="flex flex-col gap-8">
          {/* One big button first (Xin, 18-10-2026): go on with the round, or begin one with every
              machine that needs something. Then every machine, how full each is, and what sells. */}
          {next ? (
            <NextRound round={next} m={m} />
          ) : choices.length > 0 ? (
            <StartRound
              big
              label={m.refill.beginFilling}
              machineIds={orderByRoute(choices.filter((c) => !c.note).map((c) => c.id), settings.route)}
            />
          ) : null}
          <FillListButton m={m} />
          {/* Every open round can go, from here, always (Xin, 19-10-2026). */}
          <DeleteRounds rounds={deletable(rounds, m, f)} />
          {/* Vendly on the home screen, one tap to open (Xin, 18-10-2026). Only on a phone, until it is there or closed. */}
          <InstallApp />
          {grid.length > 0 && (
            <Section title={m.refill.machinesTitle}>
              <MachineGrid machines={grid} m={m} />
            </Section>
          )}
          <Suspense>
            <MapSection machines={mapMachines(fleet, grid)} depot={settings.depotAddress} m={m} />
          </Suspense>
          <LiveSold initial={sold} />
          {/* Someone new sees how a round goes; after the first one, their own figures. */}
          {stats.rounds > 0 ? <FiguresCard stats={stats} look={cleanLook(me.data.user?.user_metadata?.avatar)} /> : <HowItWorks />}
          <OpenRounds rounds={rounds.filter((round) => round.id !== next?.id)} m={m} f={f} />
          {choices.length > 0 ? (
            // Choosing machines one by one is still there, folded away under the big button's way.
            <details className="group">
              <summary className="flex h-12 cursor-pointer list-none items-center gap-1.5 px-1 text-[15px] font-semibold text-muted-foreground [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden="true" />
                {m.refill.pickOwn}
              </summary>
              <div className="pt-2">
                {/* In the owner's route order: a filler's round follows it. */}
                <MachinePicker machines={orderByRoute(choices.map((c) => c.id), settings.route).map((id) => choices.find((c) => c.id === id)!)} />
              </div>
            </details>
          ) : (
            <EmptyState title={m.team.fillerWelcome} hint={m.team.fillerWelcomeHint} icon={<ClipboardList className="size-5" />} />
          )}
        </div>
      </>
    );
  }
  const orgId = await requireOrgId();
  const operator = await isOperator();
  // All at once, each loader with its own checks.
  const [openRounds, machines, sheets, shortages, slots, ownerSettings] = await Promise.all([
    operator ? getOpenRounds(orgId) : Promise.resolve<OpenRound[]>([]),
    getMachines(orgId),
    getRefillSheets(orgId),
    getShortages(orgId),
    operator ? getMachineStock(orgId) : Promise.resolve([]),
    operator ? getRoundSettings(orgId) : Promise.resolve(null),
  ]);
  // The filler's way, for the owner too (Xin, 20-10-2026): one big button to a
  // round with every machine that needs something, filled by the owner
  // themselves; the machines as tiles; choosing them one by one folded away.
  const route = ownerSettings?.route ?? [];
  const start = startable(machines, slots, openRounds, route);
  // A round of their own still open is carried on with, not started beside:
  // its machines count as busy, so the start button alone would vanish.
  const own = operator ? ownRound(openRounds) : null;
  const ownerGrid = operator ? gridMachines(start.stocked, slotsFilledByVendly(slots, machines), route, { onRound: filledOnOpenRound(openRounds) }) : [];
  const ownerChoices = orderByRoute(start.stocked.map((mc) => mc.id), route).map((id) => {
    const mine = slots.filter((slot) => slot.machine_id === id && slot.product_id);
    const counted = mine.filter((slot) => slot.stock !== null);
    const lowSlots = mine.filter((slot) => needsAttention(fillLevel(slot.stock, slot.capacity))).length;
    return {
      id,
      name: machines.find((mc) => mc.id === id)!.name,
      low: lowSlots > 0 && !start.busy.has(id),
      hint: counted.length === 0 ? m.overview.stockUnknown : fmt(m.refill.items, { count: counted.reduce((sum, slot) => sum + slot.capacity - slot.stock!, 0) }),
      note: start.busy.has(id) ? m.refill.onOpenRound : undefined,
    };
  });

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
  const machineName = new Map(machines.map((mc) => [mc.id, mc.name]));

  // Bijvullen is about the rounds: a new one, the ones out now, and what each came to.
  return (
    <>
      <PageHeader title={m.refill.title} actions={operator ? <RefillTabs active="rounds" m={m} /> : undefined} />

      <div className="flex flex-col gap-10">
        {own ? (
          <NextRound round={own} m={m} />
        ) : (
          operator && start.ids.length > 0 && <StartRound big fill label={m.refill.beginFilling} machineIds={start.ids} />
        )}
        {operator && <FillListButton m={m} />}
        <LiveRounds rounds={openRounds.filter((round) => round.id !== own?.id)} />
        <DeleteRounds rounds={deletable(openRounds, m, f)} />
        {ownerGrid.length > 0 && (
          <Section title={m.refill.machinesTitle}>
            <MachineGrid machines={ownerGrid} m={m} />
          </Section>
        )}
        {operator && ownerChoices.length > 0 && (
          // Choosing machines one by one, folded away under the big button's way, as for the filler.
          <details className="group -mt-4">
            <summary className="flex h-12 cursor-pointer list-none items-center gap-1.5 px-1 text-[15px] font-semibold text-muted-foreground [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden="true" />
              {m.refill.pickOwn}
            </summary>
            <div className="pt-2">
              <MachinePicker machines={ownerChoices} canOrder fill />
            </div>
          </details>
        )}
        {/* Every machine of the owner's on the map, with how full it is where it is counted. */}
        {operator && (
          <Suspense>
            <MapSection machines={mapMachines(machines, ownerGrid)} depot={ownerSettings?.depotAddress ?? null} m={m} />
          </Suspense>
        )}
        {!operator && <p className="max-w-[60ch] px-1 text-[15px] text-muted-foreground">{m.refill.operatorOnly}</p>}

        <Section
          title={m.refill.recent}
          actions={
            operator && sheets.length > 0 ? (
              <Link href="/refill/history" className="inline-flex shrink-0 items-center gap-1 text-[14px] font-semibold text-muted-foreground hover:text-foreground">
                {m.refill.allRounds}
                <ChevronRight className="size-4" aria-hidden="true" />
              </Link>
            ) : undefined
          }
        >
          {sheets.length === 0 ? (
            <p className="px-1 text-sm text-muted-foreground">{m.refill.recentEmpty}</p>
          ) : (
            <RoundList sheets={sheets} names={machineName} m={m} f={f} />
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

/** Everything to take for the machines that need something, together and per machine (Xin, 21-10-2026). */
function FillListButton({ m }: { m: Awaited<ReturnType<typeof getI18n>>["m"] }) {
  return (
    <Link href="/refill/list" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-14 w-full justify-start gap-3 px-4 text-[16px]")}>
      <ListChecks className="size-5" />
      {m.fillList.open}
      <ChevronRight className="ml-auto size-5 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

/** The map, streamed in after the rest of the page: the page never waits for the addresses (22-10-2026). */
async function MapSection({
  machines,
  depot,
  m,
}: {
  machines: (MapMachine & { address: string | null })[];
  depot: string | null;
  m: Awaited<ReturnType<typeof getI18n>>["m"];
}) {
  const map = await machineMap(machines, depot);
  if (map.places.length === 0) return null;
  return (
    <Section title={m.machineMap.title} hint={m.machineMap.hint}>
      <MachineMap data={map} />
    </Section>
  );
}

/** The machines as the map shows them: name, address, and the fill their tile shows. */
function mapMachines(machines: Machine[], grid: GridMachine[]): (MapMachine & { address: string | null })[] {
  const tiles = new Map(grid.map((tile) => [tile.id, tile]));
  return machines.map((mc) => ({
    id: mc.id,
    name: mc.name,
    address: mc.address,
    fill: tiles.get(mc.id)?.fill ?? null,
    onRound: tiles.get(mc.id)?.onRound ?? false,
  }));
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

/** The open rounds as "Rondes verwijderen" lists them: when made, how far, and where it goes. */
function deletable(
  rounds: OpenRound[],
  m: Awaited<ReturnType<typeof getI18n>>["m"],
  f: Awaited<ReturnType<typeof getI18n>>["f"],
): DeletableRound[] {
  return rounds.map((round) => ({
    id: round.id,
    title: f.dateTime(round.createdAt),
    subtitle: [
      fmt(m.refill.roundProgress, { done: round.machines.filter((machine) => machine.done).length, total: round.machines.length }),
      round.machines.map((machine) => machine.name).join(", "),
    ].join(" · "),
  }));
}

