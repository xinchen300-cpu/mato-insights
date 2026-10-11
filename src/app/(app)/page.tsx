import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CalendarClock, CircleDashed, Link2, PackageOpen, WifiOff, type LucideIcon } from "lucide-react";
import { RevenueChart } from "@/components/charts/revenue-chart";
import { Delta } from "@/components/delta";
import { KpiHero, MiniStat } from "@/components/kpi";
import { StatusDot } from "@/components/machine/status-badge";
import { Avatar, ListRow, RowList, initial } from "@/components/list-row";
import { InsightsList } from "@/components/insights-list";
import { SetupGuide, nextSetupStep } from "@/components/setup-guide";
import { EmptyState, PageHeader, Section } from "@/components/page-header";
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
import { compareSince, fillDays, lastFullWeeks } from "@/lib/stats";
import { terminalStatus } from "@/lib/terminal-status";
import { denyFiller, getCurrentOrgId, isOperator } from "@/lib/org";
import { fillLevel, needsAttention } from "@/lib/stock";
import { cn } from "@/lib/utils";

const RECENT_MS = 90 * 24 * 60 * 60 * 1000;

// Urgency of a to-do row, worst first: a dead terminal outranks a stale label.
type Tone = "negative" | "warning" | "muted";
const toneAvatar: Record<Tone, "negative" | "warning" | "neutral"> = {
  negative: "negative",
  warning: "warning",
  muted: "neutral",
};
const LOW_ROWS = 3;

export default async function OverviewPage() {
  await denyFiller();
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

  const counted = machines.filter((mc) => mc.type !== "other");
  const onlineCount = counted.filter(
    (mc) => terminalStatus(mc.last_connected_at, mc.last_disconnected_at) === "online",
  ).length;
  // Something that only began selling after the earlier period started gets
  // "new since …" instead of a percentage against a half-empty period.
  const newSince = (firstSale: string | null) =>
    firstSale ? fmt(m.stats.newSince, { date: f.dayMonth(firstSale) }) : undefined;
  const compareOf = (report: typeof month, label?: string) => ({
    current: report.totals.revenue,
    previous: report.totals.prev_revenue,
    label,
    verdict: compareSince(report.totals.units, report.totals.prev_units, report.first_sale, report.prev_start),
    notes: { tooFew: m.stats.tooFewToCompare, noise: m.stats.withinNoise, new: newSince(report.first_sale) },
  });

  return (
    <>
      <PageHeader
        title={m.overview.title}
        subtitle={syncedAt ? fmt(m.overview.updated, { time: f.relative(syncedAt) }) : undefined}
      />

      <div className="flex flex-col gap-10">
        {/* The balance, as a bank would show it: one figure, its trend, the curve. */}
        <section className="surface-card px-5 pb-4 pt-6 sm:px-8 sm:pb-6 sm:pt-8">
          <KpiHero
            label={m.overview.month}
            value={f.euro(month.totals.revenue)}
            compare={compareOf(month, m.periods.compareMonth)}
            detail={plural(month.totals.units, m.common.salesOne, m.common.salesOther)}
            f={f}
          />
          <div className="mt-7 grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
            <MiniStat label={m.overview.today} value={f.euro(today.totals.revenue)} compare={compareOf(today)} f={f} />
            <MiniStat label={m.overview.week} value={f.euro(week.totals.revenue)} compare={compareOf(week)} f={f} />
            <MiniStat
              label={m.stats.avgSale}
              value={month.totals.units > 0 ? f.euro(month.totals.revenue / month.totals.units) : "—"}
              f={f}
            />
            <MiniStat
              label={m.overview.machinesOnline}
              value={`${onlineCount} / ${counted.length}`}
              leading={<StatusDot status={onlineCount === counted.length ? "online" : "offline"} />}
              f={f}
            />
          </div>
          <div className="-mx-2 mt-7 sm:-mx-3">
            <RevenueChart data={chartData} height={220} />
          </div>
        </section>

        {insights.length > 0 && (
          <div className="px-1">
            <InsightsList insights={insights} m={m} f={f} />
          </div>
        )}

        {todos.length > 0 && (
          <Section title={m.overview.todo}>
            <RowList>
              {todos.map((t) => (
                <li key={t.key}>
                  <ListRow
                    href={t.href}
                    leading={
                      <Avatar tone={toneAvatar[t.tone]}>
                        <t.icon />
                      </Avatar>
                    }
                    title={<span className="whitespace-normal font-medium">{t.text}</span>}
                    chevron
                  />
                </li>
              ))}
            </RowList>
          </Section>
        )}

        <Section title={m.overview.byMachine}>
          <RowList>
            {month.by_machine.map((row) => (
              <li key={row.machine_id}>
                <ListRow
                  href={`/machines/${row.machine_id}`}
                  leading={<Avatar>{initial(row.machine_name)}</Avatar>}
                  title={row.machine_name}
                  subtitle={<span className="tabular">{plural(row.units, m.common.salesOne, m.common.salesOther)}</span>}
                  value={f.euro(row.revenue)}
                  valueSub={
                    <Delta
                      current={row.revenue}
                      previous={row.prev_revenue}
                      f={f}
                      verdict={compareSince(row.units, row.prev_units, row.first_sale, month.prev_start)}
                      noiseLabel={m.stats.withinNoise}
                      newLabel={newSince(row.first_sale)}
                      className="text-[13px]"
                    />
                  }
                />
              </li>
            ))}
          </RowList>
          <p className="px-1 text-xs text-muted-foreground">{m.stats.deltaLegend}</p>
        </Section>
      </div>
    </>
  );
}
