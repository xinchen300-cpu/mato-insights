import { CalendarClock, CalendarX, Package, PackageCheck } from "lucide-react";
import { InsightsWordmark } from "@/components/brand/insights-mark";
import { RevenueChart } from "@/components/charts/revenue-chart";
import { KpiHero, MiniStat } from "@/components/kpi";
import { Avatar, ListRow, RowList, initial } from "@/components/list-row";
import { EmptyState, PageHeader, Section } from "@/components/page-header";
import { SegmentedLinks } from "@/components/segmented";
import { LanguageToggle } from "@/components/shell/language-toggle";
import { StatsGuide } from "@/components/stats-guide";
import { TipsPanel } from "@/components/tips-panel";
import { fmt, plural } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { getBusinessByToken, getBusinessFreshness, getRecentSales, getStatsReport } from "@/lib/data";
import { mediaUrl } from "@/lib/media";
import { compareSince, fillDays } from "@/lib/stats";
import { compareLabelKey } from "@/lib/stats-params";
import type { Period } from "@/lib/types";
import { MachineIcon } from "@/components/machine/machine-icon";

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

  const compareLabel = report ? m.periods[compareLabelKey(report.period)] : undefined;
  const verdict = report
    ? compareSince(report.totals.units, report.totals.prev_units, report.first_sale, report.prev_start)
    : undefined;
  const notes = {
    tooFew: m.stats.tooFewToCompare,
    noise: m.stats.withinNoise,
    same: m.stats.aboutSame,
    new: report?.first_sale ? fmt(m.stats.newSince, { date: f.dayMonth(report.first_sale) }) : undefined,
  };

  return (
    <div className="mx-auto min-h-svh max-w-3xl px-4 pb-16 pt-4 sm:px-6 sm:pt-6">
      <header className="mb-8 flex h-10 items-center justify-between gap-3 sm:mb-10">
        <InsightsWordmark />
        <LanguageToggle />
      </header>

      {!business || !report ? (
        <p className="surface-card px-6 py-12 text-center text-[15px] text-muted-foreground">{m.portal.notFound}</p>
      ) : (
        <>
          <PageHeader
            eyebrow={m.portal.eyebrow}
            title={
              <span className="flex items-center gap-3">
                {business.logo_path && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaUrl(business.logo_path)!} alt="" className="h-10 w-14 shrink-0 object-contain" />
                )}
                <span className="min-w-0">{business.name}</span>
              </span>
            }
            subtitle={m.portal.subtitle}
          />

          <div className="flex flex-col gap-10">
            <div className="flex flex-col gap-4">
              <nav aria-label={m.stats.period} className="min-w-0 max-w-full">
                <SegmentedLinks
                  items={PERIODS.map((p) => ({ href: `?period=${p}`, label: m.periods[p], active: p === period }))}
                />
              </nav>

              {/* Food safety first: a producer who only gets this page must see what to pull before anything else. */}
              {freshness && (freshness.last_refill_at || freshness.qty_expired > 0 || freshness.qty_expiring_24h > 0) && (
                <RowList>
                  {freshness.qty_expired > 0 && (
                    <li>
                      <ListRow
                        leading={
                          <Avatar tone="negative">
                            <CalendarX />
                          </Avatar>
                        }
                        title={
                          <span className="whitespace-normal text-negative">
                            {fmt(m.portal.expired, { count: freshness.qty_expired })}
                          </span>
                        }
                      />
                    </li>
                  )}
                  {freshness.qty_expiring_24h > 0 && (
                    <li>
                      <ListRow
                        leading={
                          <Avatar tone="warning">
                            <CalendarClock />
                          </Avatar>
                        }
                        title={
                          <span className="whitespace-normal text-warning">
                            {fmt(m.portal.expiringToday, { count: freshness.qty_expiring_24h })}
                          </span>
                        }
                      />
                    </li>
                  )}
                  {freshness.last_refill_at && (
                    <li>
                      <ListRow
                        leading={
                          <Avatar>
                            <PackageCheck />
                          </Avatar>
                        }
                        title={
                          <span className="whitespace-normal font-medium text-muted-foreground">
                            {fmt(m.portal.lastRefill, { when: f.date(freshness.last_refill_at) })}
                          </span>
                        }
                      />
                    </li>
                  )}
                </RowList>
              )}

              {report.totals.units === 0 ? (
                <EmptyState title={m.stats.noSales} />
              ) : (
                // The balance, as on the operator's overview: one figure, its trend, the curve.
                <section className="surface-card px-5 pb-4 pt-6 sm:px-8 sm:pb-6 sm:pt-8">
                  <KpiHero
                    label={m.stats.revenue}
                    value={f.euro(report.totals.revenue)}
                    compare={{
                      current: report.totals.revenue,
                      previous: report.totals.prev_revenue,
                      label: compareLabel,
                      verdict,
                      notes,
                    }}
                    f={f}
                  />
                  <div className="mt-7 grid grid-cols-2 gap-x-6 gap-y-6">
                    <MiniStat
                      label={m.stats.units}
                      value={f.number(report.totals.units)}
                      compare={{
                        current: report.totals.units,
                        previous: report.totals.prev_units,
                        label: compareLabel,
                        verdict,
                        notes,
                      }}
                      f={f}
                    />
                    <MiniStat
                      label={m.stats.avgSale}
                      value={f.euro(report.totals.revenue / report.totals.units)}
                      f={f}
                    />
                  </div>
                  <h2 className="mt-8 text-[13px] font-medium text-muted-foreground">{m.stats.revenueOverTime}</h2>
                  <div className="-mx-2 mt-3 sm:-mx-3">
                    <RevenueChart
                      height={220}
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
                  </div>
                </section>
              )}
            </div>

            {report.totals.units > 0 && (
              <>
                <Section title={m.portal.whatSold}>
                  <RowList>
                    {report.by_product
                      .filter((p) => p.units > 0)
                      .map((row) => (
                        <li key={row.product_id ?? "unassigned"}>
                          <ListRow
                            leading={
                              row.photo_path ? (
                                <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-surface">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={mediaUrl(row.photo_path)!}
                                    alt=""
                                    className="max-h-7 max-w-7 object-contain"
                                  />
                                </span>
                              ) : (
                                <Avatar>{row.product_name ? initial(row.product_name) : <Package />}</Avatar>
                              )
                            }
                            title={row.product_name ?? m.portal.otherProducts}
                            subtitle={
                              <span className="tabular">{plural(row.units, m.common.unitsOne, m.common.unitsOther)}</span>
                            }
                            value={f.euro(row.revenue)}
                          />
                        </li>
                      ))}
                  </RowList>
                </Section>

                {report.by_machine.length > 1 && (
                  <Section title={m.stats.perMachine}>
                    <RowList>
                      {report.by_machine.map((row) => (
                        <li key={row.machine_id}>
                          <ListRow
                            leading={<Avatar><MachineIcon /></Avatar>}
                            title={row.machine_name}
                            value={f.euro(row.revenue)}
                          />
                        </li>
                      ))}
                    </RowList>
                  </Section>
                )}
              </>
            )}

            {recent.length > 0 && (
              <Section title={m.portal.recent}>
                <RowList>
                  {recent.map((sale, i) => (
                    <li key={`${sale.occurred_at}-${i}`}>
                      <ListRow
                        leading={
                          <Avatar>{sale.product_name ? initial(sale.product_name) : <Package />}</Avatar>
                        }
                        title={sale.product_name ?? m.portal.otherProducts}
                        subtitle={f.dateTime(sale.occurred_at)}
                        value={f.euro(sale.amount)}
                      />
                    </li>
                  ))}
                </RowList>
              </Section>
            )}

            <TipsPanel m={m} count={3} title={m.portal.tipsTitle} />

            <StatsGuide m={m} f={f} />

            <p className="px-1 text-xs text-muted-foreground">{fmt(m.portal.footer, { name: business.name })}</p>
          </div>
        </>
      )}
    </div>
  );
}
