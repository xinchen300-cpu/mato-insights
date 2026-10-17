import Link from "next/link";
import { ChevronRight, ClipboardList, Plus } from "lucide-react";
import { FiguresCard, HowItWorks } from "@/components/filler/figures";
import { Avatar, ListRow, RowList, initial } from "@/components/list-row";
import { EmptyState, PageHeader, Section } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { fmt } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { getLiveSold, getMachines, getMachineStock, getMyRounds, getOpenRounds, getRefillSheets, getRoundSettings, getShortages, type OpenRound } from "@/lib/data";
import { orderByRoute } from "@/lib/round-settings";
import { fillerStats } from "@/lib/filler-stats";
import { displayName } from "@/lib/people";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { LiveRounds } from "@/components/refill/live-rounds";
import { RoundList } from "@/components/refill/round-list";
import { RefillTabs } from "@/components/refill/refill-tabs";
import { isFiller, isOperator, requireOrgId, requireRefillAccess } from "@/lib/org";
import { fillLevel, machineFill, machineTotals, needsAttention } from "@/lib/stock";
import { terminalStatus } from "@/lib/terminal-status";
import { LiveSold } from "@/components/filler/live-sold";
import { MachineGrid, type GridMachine } from "@/components/filler/machine-grid";
import { DISPLAY_TIME_ZONE } from "@/i18n/format";
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
    const [rounds, fleet, slots, mine, me, settings, sold] = await Promise.all([
      getOpenRounds(fillerOrg),
      getMachines(fillerOrg),
      getMachineStock(fillerOrg),
      getMyRounds(fillerOrg),
      createClient().then((client) => client.auth.getUser()),
      getRoundSettings(fillerOrg),
      getLiveSold(fillerOrg),
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
    // Every machine as a tile, in the owner's route order: its photo, how full it is, and online or not.
    const totals = machineTotals(slots.filter((slot) => slot.product_id).map((slot) => ({ machine_id: slot.machine_id, stock: slot.stock, capacity: slot.capacity })));
    const grid: GridMachine[] = orderByRoute(fleet.filter((mc) => pieces.has(mc.id)).map((mc) => mc.id), settings.route).map((id) => {
      const machine = fleet.find((mc) => mc.id === id)!;
      const total = totals.get(id);
      return {
        id,
        name: machine.name,
        photoPath: machine.photo_path,
        status: terminalStatus(machine.last_connected_at, machine.last_disconnected_at),
        fill: total ? machineFill(total.stock, total.capacity, total.counted) : null,
        low: pieces.get(id)?.low ?? 0,
      };
    });
    const stats = fillerStats(mine, DISPLAY_TIME_ZONE);
    const name = displayName(me.data.user);
    // The round to do now, big at the top: one already under way first, else the newest.
    const next = rounds.find((round) => round.readyAt) ?? rounds[0] ?? null;
    return (
      <>
        <PageHeader title={name ? fmt(m.round.hello, { name }) : m.refill.title} />
        <div className="flex flex-col gap-8">
          {next && <NextRound round={next} m={m} />}
          {/* What sells, as it happens, without amounts; then every machine to open and fill. */}
          <LiveSold initial={sold} />
          {grid.length > 0 && (
            <Section title={m.refill.machinesTitle}>
              <MachineGrid machines={grid} m={m} />
            </Section>
          )}
          {/* Someone new sees how a round goes; after the first one, their own figures. */}
          {stats.rounds > 0 ? <FiguresCard stats={stats} /> : <HowItWorks />}
          <OpenRounds rounds={rounds.filter((round) => round.id !== next?.id)} m={m} f={f} />
          {choices.length > 0 ? (
            // In the owner's route order: a filler's round follows it.
            <MachinePicker machines={orderByRoute(choices.map((c) => c.id), settings.route).map((id) => choices.find((c) => c.id === id)!)} />
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
  const [openRounds, machines, sheets, shortages] = await Promise.all([
    operator ? getOpenRounds(orgId) : Promise.resolve<OpenRound[]>([]),
    getMachines(orgId),
    getRefillSheets(orgId),
    getShortages(orgId),
  ]);

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
        {operator && (
          <Link href="/refill/new" className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto sm:self-start")}>
            <Plus />
            {m.refill.newRound}
          </Link>
        )}
        <LiveRounds rounds={openRounds} />
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

/**
 * The round a filler should do now, as one big card: where it goes, how far
 * along it is, and one black button. For a filler this is the whole point of
 * the page, so it is the first and largest thing on it.
 */
function NextRound({ round, m }: { round: OpenRound; m: Awaited<ReturnType<typeof getI18n>>["m"] }) {
  const underway = Boolean(round.readyAt);
  const done = round.machines.filter((machine) => machine.done).length;
  return (
    <section className="surface-card flex flex-col gap-4 p-5">
      <div className="flex items-center gap-3.5">
        <span
          className={cn(
            "grid size-12 shrink-0 place-items-center rounded-full",
            underway ? "bg-positive/12 text-positive" : "bg-surface text-foreground",
          )}
        >
          <ClipboardList className="size-6" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[19px] font-semibold tracking-[-0.02em]">{underway ? m.me.nextUnderway : m.me.nextReady}</h2>
          <p className="mt-0.5 truncate text-[13.5px] text-muted-foreground">
            {fmt(round.machines.length === 1 ? m.me.nextSubOne : m.me.nextSub, { n: round.machines.length, done })}
          </p>
        </div>
      </div>
      {round.machines.length > 1 && (
        <div className="flex gap-1.5" aria-hidden="true">
          {round.machines.map((machine) => (
            <span
              key={machine.id}
              className={cn("h-2 flex-1 rounded-full", machine.skipped ? "bg-warning/50" : machine.done ? "bg-positive" : "bg-surface")}
            />
          ))}
        </div>
      )}
      <Link href={`/vullen/${round.id}`} className={cn(buttonVariants({ size: "lg" }), "h-14 w-full rounded-2xl text-base")}>
        {underway ? m.me.nextContinue : m.me.nextBegin}
        <ChevronRight className="size-5" />
      </Link>
    </section>
  );
}

/** Machines that a round still open will fill: a second round for them would fill them twice. */
function onOpenRound(rounds: OpenRound[]): Set<string> {
  return new Set(rounds.flatMap((round) => round.machines.filter((machine) => !machine.done).map((machine) => machine.id)));
}
