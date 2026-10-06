import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CalendarClock, CircleDashed, Link2, PackageOpen, WifiOff, type LucideIcon } from "lucide-react";
import { RevenueChart } from "@/components/charts/revenue-chart";
import { Delta } from "@/components/delta";
import { InsightsList } from "@/components/insights-list";
import { SetupGuide, nextSetupStep } from "@/components/setup-guide";
import { EmptyState, PageHeader, Panel } from "@/components/page-header";
import { StatTile } from "@/components/stat-tile";
import { buttonVariants } from "@/components/ui/button";
import { DISPLAY_TIME_ZONE, fmt, plural } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import {
  getExpiryAlerts,
  getLastSales,
  getLastSyncedAt,
  getMachines,
  getMachineStock,
  getStatsReport,
  getUnassigned,
  getSetupState,
} from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildInsights } from "@/lib/insights";
import { compareCounts, fillDays, lastFullWeeks } from "@/lib/stats";
import { terminalStatus } from "@/lib/terminal-status";
import { getCurrentOrgId, isOperator } from "@/lib/org";
import { fillLevel, needsAttention } from "@/lib/stock";
import { cn } from "@/lib/utils";

const RECENT_MS = 90 * 24 * 60 * 60 * 1000;

// Urgency of a to-do row, worst first: a dead terminal outranks a stale label.
type Tone = "negative" | "warning" | "muted";
const toneColor: Record<Tone, string> = {
  negative: "text-negative",
  warning: "text-warning",
  muted: "text-muted-foreground",
};
const LOW_ROWS = 3;

export default async function OverviewPage() {
  const { m, f } = await getI18n();
  const orgId = await getCurrentOrgId();

  // Wie nog nooit door de rondleiding is, hoort niet op een leeg dashboard te
  // landen. Eén keer, en daarna nooit meer.
  const operator = await isOperator();
  if (orgId && operator) {
    const { data: org } = await createAdminClient()
      .from("organizations")
      .select("onboarded_at")
      .eq("id", orgId)
      .maybeSingle();
    if (org && !org.onboarded_at) redirect("/welkom");
  }

  if (!orgId) {
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

  // Weekday patterns only from whole weeks, and enough of them (see lib/stats).
  const patternWeeks = 8;
  const [today, week, month, weeks, machines, stock, unassigned, expiring, lastSales, syncedAt, setup] =
    await Promise.all([
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
  ]);

  if (month.totals.units === 0 && weeks.totals.units === 0) {
    return (
      <>
        <PageHeader title={m.overview.title} />
        {/* A shop has no setup of its own to finish, and /terminals is not hers. */}
        {setup.done || !operator ? (
          <EmptyState
            title={m.overview.noData}
            hint={m.overview.noDataHint}
            action={
              <Link href="/settings" className={buttonVariants()}>
                {m.overview.toSettings}
              </Link>
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
    machines.map((mc) => ({ name: mc.name, lastSale: lastSales.get(mc.id) ?? null })),
  );

  const lowByMachine = new Map<string, number>();
  for (const slot of stock) {
    if (!slot.product_id) continue;
    if (needsAttention(fillLevel(slot.stock, slot.capacity))) {
      lowByMachine.set(slot.machine_id, (lowByMachine.get(slot.machine_id) ?? 0) + 1);
    }
  }

  // One number and the machine worst off; the list lives on its own page.
  const expiringUnits = expiring.reduce((sum, a) => sum + a.qty_expired + a.qty_expiring_24h, 0);
  const worstMachine = [...expiring].sort(
    (a, b) => b.qty_expired - a.qty_expired || b.qty_expiring_24h - a.qty_expiring_24h,
  )[0];

  const offline = machines.filter(
    (mc) => terminalStatus(mc.last_connected_at, mc.last_disconnected_at) === "offline",
  );

  const recentUnassigned = unassigned.filter((g) => Date.now() - new Date(g.last_sale).getTime() < RECENT_MS);

  // Everything that asks for a decision today, gathered in one place instead of
  // three separate banners further down the page.
  const machineName = new Map(machines.map((mc) => [mc.id, mc.name]));
  const lowSorted = [...lowByMachine.entries()].sort((a, b) => b[1] - a[1]);
  const setupStep = operator && !setup.done ? nextSetupStep(setup, m) : null;
  const todos: { key: string; icon: LucideIcon; tone: Tone; text: string; href: string }[] = [
    ...offline.map((mc) => ({
      key: `offline-${mc.id}`,
      icon: WifiOff,
      tone: "negative" as const,
      text: fmt(m.status.offlineAlert, { machine: mc.name, when: f.relative(mc.last_disconnected_at!) }),
      href: `/machines/${mc.id}`,
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
      text: `${machineName.get(id) ?? ""} — ${fmt(m.overview.slotsLow, { count })}`,
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
            text: setupStep.state ? `${setupStep.title} — ${setupStep.state}` : setupStep.title,
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
            text: fmt(m.overview.unassigned, { count: recentUnassigned.length }),
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

  const tiles = [
    { label: m.overview.today, report: today, compare: m.periods.compareToday },
    { label: m.overview.week, report: week, compare: m.periods.compareWeek },
    { label: m.overview.month, report: month, compare: m.periods.compareMonth },
  ];

  return (
    <>
      <PageHeader
        title={m.overview.title}
        subtitle={syncedAt ? fmt(m.overview.updated, { time: f.relative(syncedAt) }) : undefined}
      />

      <div className="flex flex-col gap-8">
        {/* What the app is opened for, first and side by side. */}
        <section className="flex flex-col gap-4">
          <div className="grid grid-cols-1 divide-y border bg-card sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {tiles.map(({ label, report, compare }) => (
              <StatTile
                key={label}
                bare
                label={label}
                value={f.euro(report.totals.revenue)}
                current={report.totals.revenue}
                previous={report.totals.prev_revenue}
                compareLabel={compare}
                detail={plural(report.totals.units, m.common.salesOne, m.common.salesOther)}
                verdict={compareCounts(report.totals.units, report.totals.prev_units)}
                verdictNotes={{ tooFew: m.stats.tooFewToCompare, noise: m.stats.withinNoise }}
                f={f}
              />
            ))}
          </div>
          <InsightsList insights={insights} m={m} f={f} />
        </section>

        {todos.length > 0 && (
          <Panel title={m.overview.todo}>
            <ul className="-my-1 flex flex-col divide-y">
              {todos.map((t) => (
                <li key={t.key}>
                  <Link href={t.href} className="group flex items-center gap-3 py-3">
                    <t.icon className={cn("size-[18px] shrink-0", toneColor[t.tone])} aria-hidden="true" />
                    <span className="flex-1 text-[15px]">{t.text}</span>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-accent-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        <Panel title={m.overview.revenueChart}>
          <RevenueChart data={chartData} />
        </Panel>

        <Panel title={m.overview.byMachine}>
          <ul className="-my-1 flex flex-col divide-y">
            {month.by_machine.map((row) => (
              <li key={row.machine_id}>
                <Link
                  href={`/machines/${row.machine_id}`}
                  className="grid grid-cols-[1fr_auto_4.5rem] items-baseline gap-x-4 py-3 hover:text-accent-foreground"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{row.machine_name}</span>
                    <span className="tabular block text-xs text-muted-foreground">
                      {plural(row.units, m.common.salesOne, m.common.salesOther)}
                    </span>
                  </span>
                  <span className="tabular text-right font-semibold">{f.euro(row.revenue)}</span>
                  <span className="text-right">
                    <Delta
                      current={row.revenue}
                      previous={row.prev_revenue}
                      f={f}
                      verdict={compareCounts(row.units, row.prev_units)}
                      noiseLabel={m.stats.withinNoise}
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">{m.stats.deltaLegend}</p>
        </Panel>
      </div>
    </>
  );
}
