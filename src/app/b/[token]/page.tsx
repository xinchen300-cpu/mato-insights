import Link from "next/link";
import { MatoWordmark } from "@/components/brand/mato-mark";
import { RevenueChart } from "@/components/charts/revenue-chart";
import { EmptyState, Panel } from "@/components/page-header";
import { LanguageToggle } from "@/components/shell/language-toggle";
import { StatTile } from "@/components/stat-tile";
import { StatsGuide } from "@/components/stats-guide";
import { TipsPanel } from "@/components/tips-panel";
import { cn } from "@/lib/utils";
import { fmt, plural } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { getBusinessByToken, getBusinessFreshness, getRecentSales, getStatsReport } from "@/lib/data";
import { mediaUrl } from "@/lib/media";
import { compareCounts, fillDays } from "@/lib/stats";
import { compareLabelKey } from "@/lib/stats-params";
import type { Period } from "@/lib/types";

const PERIODS: Period[] = ["month", "week", "today", "last30"];

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const business = await getBusinessByToken(token);
  return { title: business?.name ?? "MATO Insights", robots: { index: false, follow: false } };
}

// A customer's own page: only the sales of its own products, nothing of the
// other businesses — the thing Televend could never do. No login, just the link.
export default async function BusinessSharePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const [{ token }, raw] = await Promise.all([params, searchParams]);
  const { m, f } = await getI18n();
  const business = await getBusinessByToken(token);

  const period: Period = PERIODS.includes(raw.period as Period) ? (raw.period as Period) : "month";

  const [report, recent, freshness] = business
    ? await Promise.all([
        getStatsReport(business.org_id, { period, businesses: [business.id] }),
        getRecentSales(business.org_id, business.id),
        getBusinessFreshness(business.org_id, business.id),
      ])
    : [null, [], null];

  return (
    <div className="mx-auto min-h-svh max-w-3xl px-4 pb-16 pt-5">
      <header className="mb-8 flex items-center justify-between gap-3">
        <MatoWordmark />
        <LanguageToggle />
      </header>

      {!business || !report ? (
        <p className="border bg-card p-8 text-center text-muted-foreground">{m.portal.notFound}</p>
      ) : (
        <div className="flex flex-col gap-6">
          <div>
            <p className="eyebrow">{m.portal.eyebrow}</p>
            <h1 className="mt-2 flex items-center gap-3 text-[2rem] sm:text-[2.6rem]">
              {business.logo_path && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl(business.logo_path)!} alt="" className="h-10 w-14 object-contain" />
              )}
              {business.name}
            </h1>
            <p className="mt-3 max-w-xl text-[15px] text-muted-foreground">{m.portal.subtitle}</p>
          </div>

          <nav className="flex flex-wrap gap-2" aria-label={m.stats.period}>
            {PERIODS.map((p) => (
              <Link
                key={p}
                href={`?period=${p}`}
                aria-current={p === period ? "page" : undefined}
                className={cn(
                  "border px-3.5 py-2 text-sm font-semibold transition-colors",
                  p === period ? "border-foreground bg-foreground text-background" : "bg-card hover:border-foreground",
                )}
              >
                {m.periods[p]}
              </Link>
            ))}
          </nav>

          {freshness && (freshness.last_refill_at || freshness.qty_expired > 0 || freshness.qty_expiring_24h > 0) && (
            <p className="border bg-card p-4 text-[15px]">
              {freshness.qty_expired > 0 && (
                <span className="block font-semibold text-negative">
                  {fmt(m.portal.expired, { count: freshness.qty_expired })}
                </span>
              )}
              {freshness.qty_expiring_24h > 0 && (
                <span className="block font-semibold text-warning">
                  {fmt(m.portal.expiringToday, { count: freshness.qty_expiring_24h })}
                </span>
              )}
              {freshness.last_refill_at && (
                <span className="block text-muted-foreground">
                  {fmt(m.portal.lastRefill, { when: f.date(freshness.last_refill_at) })}
                </span>
              )}
            </p>
          )}

          {report.totals.units === 0 ? (
            <EmptyState title={m.stats.noSales} />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatTile
                  label={m.stats.revenue}
                  value={f.euro(report.totals.revenue)}
                  current={report.totals.revenue}
                  previous={report.totals.prev_revenue}
                  compareLabel={m.periods[compareLabelKey(report.period)]}
                  verdict={compareCounts(report.totals.units, report.totals.prev_units)}
                  verdictNotes={{ tooFew: m.stats.tooFewToCompare, noise: m.stats.withinNoise }}
                  f={f}
                />
                <StatTile
                  label={m.stats.units}
                  value={f.number(report.totals.units)}
                  current={report.totals.units}
                  previous={report.totals.prev_units}
                  compareLabel={m.periods[compareLabelKey(report.period)]}
                  verdict={compareCounts(report.totals.units, report.totals.prev_units)}
                  verdictNotes={{ tooFew: m.stats.tooFewToCompare, noise: m.stats.withinNoise }}
                  f={f}
                />
                <StatTile
                  label={m.stats.avgSale}
                  value={f.euro(report.totals.revenue / report.totals.units)}
                  f={f}
                />
              </div>

              <Panel title={m.stats.revenueOverTime}>
                <RevenueChart
                  data={
                    report.period === "today"
                      ? report.by_hour.map((h) => ({ key: String(h.hour), label: `${h.hour}:00`, revenue: h.revenue }))
                      : fillDays(report).map((d) => ({
                          key: d.day,
                          label: f.dayMonth(`${d.day}T12:00:00Z`),
                          revenue: d.revenue,
                        }))
                  }
                />
              </Panel>

              <Panel title={m.portal.whatSold}>
                <ul className="flex flex-col divide-y">
                  {report.by_product
                    .filter((p) => p.units > 0)
                    .map((row) => (
                      <li
                        key={row.product_id ?? "unassigned"}
                        className="grid grid-cols-[2rem_1fr_auto] items-center gap-x-3 py-2.5"
                      >
                        <span className="grid size-8 place-items-center">
                          {row.photo_path && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={mediaUrl(row.photo_path)!} alt="" className="max-h-8 max-w-8 object-contain" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">
                            {row.product_name ?? m.portal.otherProducts}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {plural(row.units, m.common.unitsOne, m.common.unitsOther)}
                          </span>
                        </span>
                        <span className="tabular text-right font-semibold">{f.euro(row.revenue)}</span>
                      </li>
                    ))}
                </ul>
              </Panel>

              {report.by_machine.length > 1 && (
                <Panel title={m.stats.perMachine}>
                  <ul className="flex flex-col divide-y">
                    {report.by_machine.map((row) => (
                      <li key={row.machine_id} className="flex items-baseline justify-between gap-4 py-2.5">
                        <span className="truncate font-semibold">{row.machine_name}</span>
                        <span className="tabular font-semibold">{f.euro(row.revenue)}</span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}
            </>
          )}

          {recent.length > 0 && (
            <Panel title={m.portal.recent}>
              <ul className="flex flex-col divide-y">
                {recent.map((sale, i) => (
                  <li key={`${sale.occurred_at}-${i}`} className="flex items-baseline justify-between gap-4 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">
                        {sale.product_name ?? m.portal.otherProducts}
                      </span>
                      <span className="block text-xs text-muted-foreground">{f.dateTime(sale.occurred_at)}</span>
                    </span>
                    <span className="tabular shrink-0 font-semibold">{f.euro(sale.amount)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <TipsPanel m={m} count={3} title={m.portal.tipsTitle} />

          <StatsGuide m={m} f={f} />

          <p className="text-xs text-muted-foreground">{fmt(m.portal.footer, { name: business.name })}</p>
        </div>
      )}
    </div>
  );
}
