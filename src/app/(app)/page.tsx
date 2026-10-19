import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, ChefHat, ChevronRight, CircleDashed, Link2, ListChecks, PackageOpen, TriangleAlert, WifiOff, type LucideIcon } from "lucide-react";
import { RevenueChart } from "@/components/charts/revenue-chart";
import { Avatar, ListRow, RowList } from "@/components/list-row";
import { MachineRevenue } from "@/components/overview/machine-revenue";
import { revenueByMachine } from "@/lib/overview";
import { startable } from "@/lib/refill-start";
import { StartRound } from "./refill/list/start-round";
import { InsightsList } from "@/components/insights-list";
import { SetupGuide, nextSetupStep } from "@/components/setup-guide";
import { EmptyState, PageHeader, Section } from "@/components/page-header";
import { LiveRounds } from "@/components/refill/live-rounds";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DISPLAY_TIME_ZONE, fmt, plural } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import {
  getExpiryAlerts,
  getLastRefills,
  getLastSales,
  getLiveSales,
  getLastSyncedAt,
  getOpenRounds,
  getMachines,
  getMachineStock,
  getStatsReport,
  getUnassigned,
  getRoundSettings,
  getSetupState,
  hasProducerDishes,
  type OpenRound,
} from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { buildInsights } from "@/lib/insights";
import { fillDays, lastFullWeeks } from "@/lib/stats";
import { terminalStatus } from "@/lib/terminal-status";
import { denyFiller, getCurrentOrgId, isOperator } from "@/lib/org";
import { fillLevel, needsAttention, slotsFilledByVendly } from "@/lib/stock";
import { AutoRefresh } from "@/components/auto-refresh";
import { LiveSales } from "@/components/live-sales";
import { isRecent } from "@/lib/unassigned";


// Urgency of a to-do row, worst first: a dead terminal outranks a stale label.
type Tone = "negative" | "warning" | "muted";
const toneAvatar: Record<Tone, "negative" | "warning" | "neutral"> = {
  negative: "negative",
  warning: "warning",
  muted: "neutral",
};
const LOW_ROWS = 3;
/** To-dos shown before "Nog … meldingen" folds the rest away. */
const TODO_ROWS = 4;
/** "Meer zien" under Net verkocht opens this many. */
const LIVE_ROWS = 40;
/** Payter is asked every 15 seconds; only data this old is worth a word on the page. */
const STALE_MS = 15 * 60_000;
const isStale = (syncedAt: string | null) => syncedAt !== null && Date.now() - Date.parse(syncedAt) > STALE_MS;

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.overview.title };
}

export default async function OverviewPage() {
  await denyFiller();
  const { m, f } = await getI18n();
  const orgId = await getCurrentOrgId();
  const operator = await isOperator();

  if (!orgId) {
    // Signed in but in no organisation: registered without the invitation's
    // link. Settings would be a dead end; the link is the way in.
    const {
      data: { user },
    } = await (await createClient()).auth.getUser();
    if (user) return <EmptyState title={m.overview.noOrgTitle} hint={m.overview.noOrgHint} />;
    return (
      <EmptyState
        title={m.overview.noData}
        hint={m.overview.noDataHint}
        action={
          <Link href="/settings" className={buttonVariants()}>
            {m.overview.toSettings}
          </Link>
        }
      />
    );
  }

  // Everything on the page is asked for at once, each loader with its own
  // checks, and the onboarding question below runs alongside instead of first.
  // Weekday patterns only from whole weeks, and enough of them (see lib/stats).
  const patternWeeks = 8;
  const loads = Promise.all([
    operator ? getOpenRounds(orgId) : Promise.resolve<OpenRound[]>([]),
    getStatsReport(orgId, { period: "today" }),
    getStatsReport(orgId, { period: "week" }),
    getStatsReport(orgId, { period: "month" }),
    getStatsReport(orgId, { period: "custom", ...lastFullWeeks(patternWeeks, DISPLAY_TIME_ZONE) }),
    getMachines(orgId),
    getMachineStock(orgId),
    getUnassigned(orgId),
    getExpiryAlerts(orgId),
    getLastSales(orgId),
    getLastSyncedAt(orgId),
    getSetupState(orgId),
    getLiveSales(orgId, { limit: LIVE_ROWS }),
    getLastRefills(orgId),
    hasProducerDishes(orgId),
    operator ? getRoundSettings(orgId) : Promise.resolve(null),
  ]);
  // A redirect below leaves it unawaited: a failure in it must not go unhandled.
  loads.catch(() => undefined);

  // Wie nog nooit door de rondleiding is, hoort niet op een leeg dashboard te
  // landen. Eén keer, en daarna nooit meer. Wat al geladen werd, vervalt dan.
  let orgName: string | null = null;
  if (operator) {
    const { data: org } = await createAdminClient()
      .from("organizations")
      .select("onboarded_at, name")
      .eq("id", orgId)
      .maybeSingle();
    if (org && !org.onboarded_at) redirect("/welkom");
    orgName = (org?.name as string | null) ?? null;
  }

  const [openRounds, today, week, month, weeks, machines, stock, unassigned, expiring, lastSales, syncedAt, setup, recentSales, refills, kitchen, roundSettings] =
    await loads;
  // Only the rounds actually out (started), and only for the operator.
  const liveRounds = openRounds.filter((round) => round.readyAt);

  if (month.totals.units === 0 && weeks.totals.units === 0) {
    return (
      <>
        <AutoRefresh />
        <PageHeader title={m.overview.title} />
        {/* A shop has no setup of its own to finish, and /terminals is not hers. */}
        {setup.done || !operator ? (
          <EmptyState
            title={m.overview.noData}
            hint={operator ? m.overview.noDataHint : m.overview.noDataShop}
            action={
              operator && (
                <Link href="/settings" className={buttonVariants()}>
                  {m.overview.toSettings}
                </Link>
              )
            }
          />
        ) : (
          <SetupGuide setup={setup} m={m} />
        )}
      </>
    );
  }

  const insights = buildInsights(
    month,
    weeks,
    patternWeeks,
    machines.map((mc) => ({ id: mc.id, name: mc.name, lastSale: lastSales.get(mc.id) ?? null })),
  );
  // A machine gone quiet is something to go and check, so it is a to-do; the
  // rest is good to know and sits at the foot of the page.
  const quiet = insights.flatMap((i) => (i.kind === "quietMachine" ? [i] : []));
  const goodToKnow = insights.filter((i) => i.kind !== "quietMachine").slice(0, 3);

  const lowByMachine = new Map<string, number>();
  // A machine filled by hand has no stock to warn about.
  for (const slot of slotsFilledByVendly(stock, machines)) {
    if (!slot.product_id) continue;
    if (needsAttention(fillLevel(slot.stock, slot.capacity))) {
      lowByMachine.set(slot.machine_id, (lowByMachine.get(slot.machine_id) ?? 0) + 1);
    }
  }

  // One number and the machine worst off; the list lives on its own page.
  // Dates of a machine filled by hand are not known to Vendly either.
  const dated = slotsFilledByVendly(expiring, machines);
  const expiringUnits = dated.reduce((sum, a) => sum + a.qty_expired + a.qty_expiring_24h, 0);
  const worstMachine = [...dated].sort(
    (a, b) => b.qty_expired - a.qty_expired || b.qty_expiring_24h - a.qty_expiring_24h,
  )[0];

  const offline = machines.filter(
    (mc) => terminalStatus(mc.last_connected_at, mc.last_disconnected_at) === "offline",
  );

  const recentUnassigned = unassigned.filter((g) => isRecent(g));

  // Everything that asks for a decision today, gathered in one place instead of
  // three separate banners further down the page.
  const machineName = new Map(machines.map((mc) => [mc.id, mc.name]));
  const lowSorted = [...lowByMachine.entries()].sort((a, b) => b[1] - a[1]);
  const setupStep = operator && !setup.done ? nextSetupStep(setup, m) : null;
  const todos: Todo[] = [
    ...offline.map((mc) => ({
      key: `offline-${mc.id}`,
      icon: WifiOff,
      tone: "negative" as const,
      text: fmt(m.overview.todoOffline, { machine: mc.name, when: f.relative(mc.last_disconnected_at!) }),
      href: `/machines/${mc.id}`,
    })),
    // A machine that is offline sells nothing anyway: once is enough, as offline.
    ...quiet.filter((q) => !offline.some((mc) => mc.id === q.machineId)).map((q) => ({
      key: `quiet-${q.machineId}`,
      icon: TriangleAlert,
      tone: "warning" as const,
      text: fmt(m.overview.todoQuiet, { machine: q.machine, days: q.days }),
      href: `/machines/${q.machineId}`,
    })),
    ...(expiringUnits > 0 && worstMachine
      ? [
          {
            key: "expiry",
            icon: CalendarClock,
            tone: "warning" as const,
            text: fmt(m.expiry.banner, { count: expiringUnits, machine: worstMachine.machine_name }),
            href: "/expiry",
          },
        ]
      : []),
    ...lowSorted.slice(0, LOW_ROWS).map(([id, count]) => ({
      key: `low-${id}`,
      icon: PackageOpen,
      tone: "warning" as const,
      text: `${machineName.get(id) ?? ""} · ${fmt(m.overview.slotsLow, { count })}`,
      href: `/machines/${id}`,
    })),
    ...(lowSorted.length > LOW_ROWS
      ? [
          {
            key: "low-more",
            icon: PackageOpen,
            tone: "muted" as const,
            text: fmt(m.overview.todoMoreLow, { count: lowSorted.length - LOW_ROWS }),
            href: "/machines",
          },
        ]
      : []),
    ...(setupStep
      ? [
          {
            key: "setup",
            icon: CircleDashed,
            tone: "muted" as const,
            text: setupStep.short,
            href: setupStep.href,
          },
        ]
      : []),
    ...(recentUnassigned.length > 0
      ? [
          {
            key: "unassigned",
            icon: Link2,
            tone: "muted" as const,
            text: plural(recentUnassigned.length, m.overview.unassignedOne, m.overview.unassigned),
            href: "/unassigned",
          },
        ]
      : []),
  ];

  const chartData = fillDays(month).map((d) => ({
    key: d.day,
    label: f.dayMonth(`${d.day}T12:00:00Z`),
    revenue: d.revenue,
  }));

  // Only a sync that stalled gets a word under the title.
  const stale = isStale(syncedAt);
  // Something that only began selling after the earlier period started gets
  // "new since …" instead of a percentage against a half-empty period.
  const newSince = (firstSale: string | null) =>
    firstSale ? fmt(m.stats.newSince, { date: f.dayMonth(firstSale) }) : undefined;
  // Every machine with its money for today, this week and this month (Xin,
  // 19-10-2026: per machine rather than one total), how full it is and when it
  // was last filled; all of them together is one line above.
  const revenue = revenueByMachine({ reports: { today, week, month }, machines, stock, refills, orgName, newSince });
  // What "Vul route beginnen" puts on a round, as on the filler's home.
  const roundStart = startable(machines, stock, openRounds, roundSettings?.route ?? []);

  return (
    <>
      {/* New sales arrive within a minute; the page shows them without a reload. */}
      {/* One timer for the page: quicker while a round is out, so the filler is seen moving on. */}
      <AutoRefresh every={liveRounds.length ? 20_000 : 30_000} />
      <PageHeader
        title={m.overview.title}
        subtitle={
          stale && syncedAt ? (
            <span className="font-medium text-warning">{fmt(m.overview.updated, { time: f.relative(syncedAt) })}</span>
          ) : undefined
        }
      />

      {/* What needs doing, then the money machine by machine, what just sold,
          the month day by day. One thing per block (Xin, 19-10-2026). */}
      <div className="flex flex-col gap-8">
        {/* A round that is out right now comes first: who, how long, where. */}
        {liveRounds.length > 0 && <LiveRounds rounds={liveRounds} refresh={false} />}
        {/* The owner's day in a few taps: the filler's start button (Xin, 20-10-2026), the kitchen's order, what each machine needs. */}
        {operator && (
          <div className="flex flex-col gap-3">
            {roundStart.ids.length > 0 && <StartRound fill label={m.refill.beginFilling} machineIds={roundStart.ids} />}
          <nav aria-label={m.overview.quick} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {kitchen && (
              <Link href="/refill/kitchen" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "shrink-0")}>
                <ChefHat />
                {m.kitchen.title}
              </Link>
            )}
            <Link href="/refill/list" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "shrink-0")}>
              <ListChecks />
              {m.nav.fillList}
            </Link>
          </nav>
          </div>
        )}
        {/* What needs doing today first, above the money (UX review, 17-10-2026); a long list folds. */}
        {todos.length > 0 && (
          <Section title={m.overview.todo}>
            <RowList>
              {todos.slice(0, TODO_ROWS).map((t) => (
                <TodoRow key={t.key} todo={t} />
              ))}
            </RowList>
            {todos.length > TODO_ROWS && (
              <details className="group">
                <summary className="flex h-11 cursor-pointer list-none items-center gap-1.5 px-3 text-[14.5px] font-semibold text-muted-foreground [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden="true" />
                  {fmt(m.overview.moreTodos, { n: todos.length - TODO_ROWS })}
                </summary>
                <RowList>
                  {todos.slice(TODO_ROWS).map((t) => (
                    <TodoRow key={t.key} todo={t} />
                  ))}
                </RowList>
              </details>
            )}
          </Section>
        )}

        <MachineRevenue machines={revenue.machines} totals={revenue.totals} />

        {/* What just sold, sliding in as it happens; "Meer zien" opens the day's list. */}
        <LiveSales initial={recentSales} />

        {/* The month, day by day. */}
        <section className="surface-card px-3 pb-4 pt-5 sm:px-5">
          <h2 className="px-2 text-[17px] font-semibold tracking-[-0.02em]">{m.overview.revenueChart}</h2>
          <div className="-mx-1 mt-4">
            <RevenueChart data={chartData} height={200} />
          </div>
        </section>

        <InsightsList insights={goodToKnow} m={m} f={f} />
      </div>
    </>
  );
}

type Todo = { key: string; icon: LucideIcon; tone: Tone; text: string; href: string };

function TodoRow({ todo }: { todo: Todo }) {
  return (
    <li>
      <ListRow
        href={todo.href}
        leading={
          <Avatar tone={toneAvatar[todo.tone]}>
            <todo.icon />
          </Avatar>
        }
        title={<span className="whitespace-normal font-medium">{todo.text}</span>}
        chevron
      />
    </li>
  );
}
