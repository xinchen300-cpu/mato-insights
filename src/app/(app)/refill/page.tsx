import Link from "next/link";
import { CalendarClock, ChevronRight, ClipboardList, Plus } from "lucide-react";
import { FiguresCard, HowItWorks } from "@/components/filler/figures";
import { Avatar, ListRow, RowList, initial } from "@/components/list-row";
import { EmptyState, PageHeader, Section } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { fmt } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { getLiveSold, getMachines, getMachineStock, getMyRounds, getOpenRounds, getRefillSheets, getRoundSettings, getShortages, getVisitAdvice, type OpenRound } from "@/lib/data";
import { orderByRoute } from "@/lib/round-settings";
import { cleanLook } from "@/lib/avatar";
import { fillerStats } from "@/lib/filler-stats";
import { displayName } from "@/lib/people";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { LiveRounds } from "@/components/refill/live-rounds";
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
    const [rounds, everyMachine, everySlot, mine, me, settings, sold, advice] = await Promise.all([
      getOpenRounds(fillerOrg),
      getMachines(fillerOrg),
      getMachineStock(fillerOrg),
      getMyRounds(fillerOrg),
      createClient().then((client) => client.auth.getUser()),
      getRoundSettings(fillerOrg),
      getLiveSold(fillerOrg),
      getVisitAdvice(fillerOrg),
    ]);
    // Machines not worth today's visit (Xin, 19-10-2026): off the big button, on a card that says why.
    const skip = new Map(advice.filter((a) => a.skip).map((a) => [a.machineId, a]));
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
    const busy = onOpenRound(rounds);
    const choices = fleet
      .filter((mc) => pieces.has(mc.id))
      .map((mc) => {
        const p = pieces.get(mc.id)!;
        return {
          id: mc.id,
          name: mc.name,
          low: p.low > 0 && !busy.has(mc.id) && !skip.has(mc.id),
          hint: p.counted === 0 ? m.overview.stockUnknown : fmt(m.refill.items, { count: p.toAdd }),
          note: busy.has(mc.id) ? m.refill.onOpenRound : skip.has(mc.id) ? m.refill.skipNote : undefined,
        };
      });
    const skipped = orderByRoute(
      choices.filter((c) => skip.has(c.id) && !busy.has(c.id)).map((c) => c.id),
      settings.route,
    ).map((id) => ({ name: choices.find((c) => c.id === id)!.name, missed: skip.get(id)!.missed }));
    // Every machine as a tile, in the owner's route order: its photo, how full it is, and online or not.
    const grid = gridMachines(fleet, slots, settings.route);
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
          ) : choices.some((c) => !c.note) ? (
            <StartRound
              big
              label={m.refill.beginFilling}
              machineIds={orderByRoute(choices.filter((c) => !c.note).map((c) => c.id), settings.route)}
            />
          ) : null}
          {!next && skipped.length > 0 && <SkipToday machines={skipped} m={m} />}
          {/* Every open round can go, from here, always (Xin, 19-10-2026). */}
          <DeleteRounds rounds={deletable(rounds, m, f)} />
          {/* Vendly on the home screen, one tap to open (Xin, 18-10-2026). Only on a phone, until it is there or closed. */}
          <InstallApp />
          {grid.length > 0 && (
            <Section title={m.refill.machinesTitle}>
              <MachineGrid machines={grid} m={m} />
            </Section>
          )}
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
        <DeleteRounds rounds={deletable(openRounds, m, f)} />
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
    <Link
      href={`/vullen/${round.id}`}
      className="flex min-h-20 items-center gap-3.5 rounded-2xl bg-foreground px-4 py-3.5 text-background shadow-[var(--shadow-pop)] transition-transform active:scale-[0.99]"
    >
      <span
        className={cn("grid size-12 shrink-0 place-items-center rounded-full", underway ? "bg-positive text-white" : "bg-background/15")}
      >
        <ClipboardList className="size-6" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[20px] font-semibold tracking-[-0.01em]">{underway ? m.refill.continueFilling : m.me.nextBegin}</span>
        <span className="truncate text-[13.5px] opacity-75">
          {fmt(round.machines.length === 1 ? m.me.nextSubOne : m.me.nextSub, { n: round.machines.length, done })}
        </span>
      </span>
      <ChevronRight className="size-6 shrink-0" aria-hidden="true" />
    </Link>
  );
}

/**
 * The machines the big button leaves out today, and what they miss until
 * tomorrow's round, in dishes only. Going anyway is the picker below.
 */
function SkipToday({ machines, m }: { machines: { name: string; missed: number }[]; m: Awaited<ReturnType<typeof getI18n>>["m"] }) {
  return (
    <div className="surface-card flex flex-col gap-2 px-4 py-3.5">
      <p className="flex items-center gap-2 text-[16px] font-semibold">
        <CalendarClock className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        {m.refill.skipTitle}
      </p>
      <ul className="flex flex-col gap-1.5">
        {machines.map((machine) => (
          <li key={machine.name} className="flex flex-col">
            <span className="text-[15px] font-semibold">{machine.name}</span>
            <span className="text-[13.5px] text-muted-foreground">
              {machine.missed < 1 ? m.refill.skipMissedLess : fmt(m.refill.skipMissed, { n: Math.round(machine.missed) })}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[13px] text-muted-foreground">{m.refill.skipHint}</p>
    </div>
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

/** Machines that a round still open will fill: a second round for them would fill them twice. */
function onOpenRound(rounds: OpenRound[]): Set<string> {
  return new Set(rounds.flatMap((round) => round.machines.filter((machine) => !machine.done).map((machine) => machine.id)));
}
