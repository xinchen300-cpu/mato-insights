import { Suspense } from "react";
import { ArrowRight, ChartNoAxesColumn, Download, Link2, TriangleAlert } from "lucide-react";
import { BarList } from "@/components/charts/bar-list";
import { HourChart } from "@/components/charts/hour-chart";
import { RevenueChart } from "@/components/charts/revenue-chart";
import { Delta } from "@/components/delta";
import { KpiHero, MiniStat } from "@/components/kpi";
import { Avatar, ListRow, RowList, initial } from "@/components/list-row";
import { EmptyState, PageHeader, Panel, Section } from "@/components/page-header";
import { StatsGuide } from "@/components/stats-guide";
import { buttonVariants } from "@/components/ui/button";
import { changeRatio, fmt, plural } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import Link from "next/link";
import { getBusinesses, getMachines, getPriceMismatches, getProducts, getStatsReport } from "@/lib/data";
import { mediaUrl } from "@/lib/media";
import { denyFiller, requireOrgId } from "@/lib/org";
import { busiestWeekday, compareCounts, compareSince, fillDays, MIN_WEEKS, periodDays, weekdayStats } from "@/lib/stats";
import { compareLabelKey, parseStatsParams, type StatsSearchParams } from "@/lib/stats-params";
import type { StatsReport } from "@/lib/types";
import { MonthlyOverview, MonthlySkeleton } from "./monthly";
import { StatsFilters } from "./stats-filters";
import { MachineIcon } from "@/components/machine/machine-icon";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.stats.title };
}


export default async function StatisticsPage({ searchParams }: { searchParams: Promise<StatsSearchParams> }) {
  await denyFiller();
  const raw = await searchParams;
  const { m, f } = await getI18n();
  const orgId = await requireOrgId();
  const { period, from, to, business, machine, product, year, thisYear, filters } = parseStatsParams(raw);

  const [report, machines, businesses, products, mismatches] = await Promise.all([
    getStatsReport(orgId, filters),
    getMachines(orgId),
    getBusinesses(orgId),
    getProducts(orgId),
    getPriceMismatches(orgId),
  ]);

  // A slot taking several different prices carries several products through one
  // number, so nothing here can say what sold. Saying it is the whole point of
  // this app; a confident ranking built on that would be the one lie it tells.
  const scrambled = [
    ...new Set(
      mismatches
        .filter((row) => row.spread > 0 && (!machine || row.machine_id === machine))
        .map((row) => row.machine_name),
    ),
  ];

  const compare = m.periods[compareLabelKey(report.period)];
  const { totals } = report;
  const avg = totals.units ? totals.revenue / totals.units : 0;
  const prevAvg = totals.prev_units ? totals.prev_revenue / totals.prev_units : 0;

  const named = report.by_product.filter((p) => p.product_id);
  // Sorted here on purpose: the headline above ranks by pieces, so this panel
  // must too, or the same screen names two different best sellers.
  const best = named
    .filter((p) => p.units > 0)
    .sort((a, b) => b.units - a.units || b.revenue - a.revenue)
    .slice(0, 5);
  const slowest = [...named].sort((a, b) => a.units - b.units || a.revenue - b.revenue).slice(0, 5);
  // Judging a product slow takes whole weeks: fewer and it is mostly luck.
  const days = periodDays(report).length;
  const longEnough = days >= MIN_WEEKS * 7;
  const weekdays = weekdayStats(report);
  // Coloured only when one weekday really sells more, by the same test the
  // overview uses, and only when that day is also the longest bar here: the
  // test counts pieces, the bars show money.
  const busiest = busiestWeekday(report);
  const longest = [...weekdays].sort((a, b) => b.avgRevenue - a.avgRevenue)[0];
  const highlightDay = busiest && longest?.weekday === busiest.weekday ? String(busiest.weekday) : null;
  // Something that only began selling after the earlier period started gets
  // "new since …" instead of a percentage against a half-empty period.
  const newSince = (firstSale: string | null) =>
    firstSale ? fmt(m.stats.newSince, { date: f.dayMonth(firstSale) }) : undefined;
  const since = (row: { units: number; prev_units: number; first_sale: string | null }) =>
    compareSince(row.units, row.prev_units, row.first_sale, report.prev_start);
  const unitsVerdict = since({ ...totals, first_sale: report.first_sale });
  const verdictNotes = { tooFew: m.stats.tooFewToCompare, noise: m.stats.withinNoise, same: m.stats.aboutSame, new: newSince(report.first_sale) };

  const exportParams = new URLSearchParams(
    Object.entries({ period, from, to, business, machine, product }).filter(([, v]) => v) as [string, string][],
  );

  const { product: productLine } = summary(report, m, f, compare);

  const monthly = (
    <Suspense fallback={<MonthlySkeleton />}>
      <MonthlyOverview
        orgId={orgId}
        filters={{ machines: filters.machines, businesses: filters.businesses, products: filters.products }}
        year={year}
        thisYear={thisYear}
        params={exportParams}
      />
    </Suspense>
  );

  return (
    <>
      <PageHeader
        title={m.stats.title}
        actions={
          <a href={`/statistics/csv?${exportParams}`} className={buttonVariants({ variant: "outline" })}>
            <Download />
            {m.stats.export}
          </a>
        }
      />

      <div className="flex flex-col gap-8 sm:gap-10">
        <Suspense>
          <StatsFilters
            period={period}
            from={from}
            to={to}
            business={business}
            machine={machine}
            product={product}
            businesses={businesses.map((b) => ({ id: b.id, name: b.name }))}
            machines={machines.map((mc) => ({
              id: mc.id,
              name: mc.name,
              // A shared fridge belongs to both its businesses, here as everywhere else.
              businessIds: [mc.business_id, mc.shared_business_id].filter((id): id is string => Boolean(id)),
            }))}
            products={products.map((p) => ({ id: p.id, name: p.name }))}
          />
        </Suspense>

        {totals.units === 0 ? (
          <>
            <EmptyState title={m.stats.noSales} icon={<ChartNoAxesColumn className="size-5" />} />
            {monthly}
          </>
        ) : (
          <>
            {/* The one figure this page is about, what it means, then the curve. */}
            <section className="surface-card px-5 pb-4 pt-6 sm:px-8 sm:pb-6 sm:pt-8">
              <KpiHero
                label={m.stats.revenue}
                value={f.euro(totals.revenue)}
                compare={{
                  current: totals.revenue,
                  previous: totals.prev_revenue,
                  label: compare,
                  verdict: unitsVerdict,
                  notes: verdictNotes,
                }}
                f={f}
              />

              {productLine && <p className="figure mt-4 max-w-2xl text-sm text-muted-foreground">{productLine}</p>}

              <div className="mt-7 grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3">
                <MiniStat
                  label={m.stats.units}
                  value={f.number(totals.units)}
                  compare={{
                    current: totals.units,
                    previous: totals.prev_units,
                    verdict: unitsVerdict,
                    notes: verdictNotes,
                  }}
                  f={f}
                />
                <MiniStat
                  label={m.stats.avgSale}
                  value={f.euro(avg)}
                  detail={prevAvg > 0 ? fmt(m.stats.avgBefore, { amount: f.euro(prevAvg) }) : undefined}
                  f={f}
                />
              </div>

              <div className="mt-7">
                <h2 className="sr-only">{m.stats.revenueOverTime}</h2>
                <div className="-mx-2 sm:-mx-3">
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
              </div>
            </section>

            <StatsGuide m={m} f={f} />

            {monthly}

            <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
              <Panel
                title={m.stats.busiestDays}
                hint={
                  weekdays.every((w) => w.days >= MIN_WEEKS)
                    ? m.stats.busiestDaysHint
                    : fmt(m.stats.busiestDaysTooShort, { weeks: MIN_WEEKS })
                }
              >
                <BarList
                  items={weekdays.map((w) => ({
                    key: String(w.weekday),
                    label: m.weekdaysShort[w.weekday - 1],
                    value: w.avgRevenue,
                    display: f.euroRound(w.avgRevenue),
                  }))}
                  highlightKey={highlightDay}
                />
              </Panel>
              <Panel title={m.stats.busiestHours}>
                <HourChart data={report.by_hour} />
              </Panel>
            </div>

            {scrambled.length > 0 && (
              <div className="surface-card flex items-start gap-3.5 p-5 sm:p-6">
                <Avatar tone="warning">
                  <TriangleAlert />
                </Avatar>
                <div className="min-w-0 pt-0.5">
                  <p className="text-[16px] font-semibold tracking-[-0.015em] text-heading">{m.stats.mixedTitle}</p>
                  <p className="mt-1 max-w-[62ch] text-sm text-muted-foreground">
                    {fmt(m.stats.mixedBody, { machines: scrambled.join(", ") })}
                  </p>
                  <Link
                    href="/unassigned"
                    className="-mx-1 mt-2 inline-flex items-center gap-1 rounded-full px-1 py-1 text-sm font-semibold text-foreground underline-offset-4 hover:underline"
                  >
                    {m.stats.mixedFix}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            )}

            <div className="grid gap-8 sm:gap-10 lg:grid-cols-2 lg:gap-6">
              <Section title={m.stats.bestSellers}>
                <ProductRanking rows={best} prevStart={report.prev_start} m={m} f={f} />
              </Section>
              <Section title={m.stats.worstSellers} hint={longEnough ? m.stats.worstSellersHint : undefined}>
                {longEnough ? (
                  <ProductRanking rows={slowest} prevStart={report.prev_start} m={m} f={f} />
                ) : (
                  <p className="surface-card px-5 py-5 text-sm text-muted-foreground">
                    {fmt(m.stats.worstSellersTooShort, { days })}
                  </p>
                )}
              </Section>
            </div>

            <Section title={m.stats.perMachine}>
              <RowList>
                {report.by_machine.map((row) => (
                  <li key={row.machine_id}>
                    <ListRow
                      leading={<Avatar><MachineIcon /></Avatar>}
                      title={row.machine_name}
                      subtitle={<span className="tabular">{plural(row.units, m.common.unitsOne, m.common.unitsOther)}</span>}
                      value={f.euro(row.revenue)}
                      valueSub={
                        <Delta
                          current={row.revenue}
                          previous={row.prev_revenue}
                          f={f}
                          verdict={since(row)}
                          noiseLabel={m.stats.withinNoise}
                          sameLabel={m.stats.aboutSame}
                          newLabel={newSince(row.first_sale)}
                          className="text-[13px]"
                        />
                      }
                    />
                  </li>
                ))}
              </RowList>
            </Section>

            <Section title={m.stats.perProduct}>
              <RowList>
                {report.by_product
                  .filter((p) => p.units > 0)
                  .map((row) => (
                    <li key={row.product_id ?? "unassigned"}>
                      <ListRow
                        leading={<ProductAvatar row={row} />}
                        title={
                          row.product_id ? (
                            (row.product_name ?? m.stats.unassignedProduct)
                          ) : (
                            <span className="font-medium italic text-muted-foreground">
                              {row.product_name ?? m.stats.unassignedProduct}
                            </span>
                          )
                        }
                        subtitle={
                          <span className="tabular">{plural(row.units, m.common.unitsOne, m.common.unitsOther)}</span>
                        }
                        value={f.euro(row.revenue)}
                        valueSub={
                          <Delta
                            current={row.revenue}
                            previous={row.prev_revenue}
                            f={f}
                            verdict={since(row)}
                            noiseLabel={m.stats.withinNoise}
                            sameLabel={m.stats.aboutSame}
                            newLabel={newSince(row.first_sale)}
                            className="text-[13px]"
                          />
                        }
                      />
                    </li>
                  ))}
              </RowList>
            </Section>
          </>
        )}
      </div>
    </>
  );
}

function summary(
  report: StatsReport,
  m: Awaited<ReturnType<typeof getI18n>>["m"],
  f: Awaited<ReturnType<typeof getI18n>>["f"],
  compare: string,
): { headline: string; product: string | null } {
  const { totals } = report;
  const revenue = f.euro(totals.revenue);
  const ratio = changeRatio(totals.revenue, totals.prev_revenue);
  const verdict = compareSince(totals.units, totals.prev_units, report.first_sale, report.prev_start);
  const unitRatio = changeRatio(totals.units, totals.prev_units);
  // The verdict counts pieces, the percentage counts euros, and the two can
  // point opposite ways when the mix shifts. Saying "a real increase" above a
  // minus sign is the kind of nonsense Vendly exists to avoid, so when they
  // disagree the sentence says what actually happened instead.
  const mixShift =
    ratio !== null && unitRatio !== null && (verdict === "up" || verdict === "down") && ratio * unitRatio < 0;

  const headline =
    ratio === null || verdict === "new"
      ? fmt(m.stats.summaryNoCompare, { revenue })
      : verdict === "tooFew"
        ? fmt(m.stats.summaryTooFew, { revenue })
        : mixShift
          ? fmt(verdict === "up" ? m.stats.summaryMoreForLess : m.stats.summaryLessForMore, {
              revenue,
              change: f.change(ratio),
              units: f.percent(Math.abs(unitRatio!)),
              compare,
            })
          : verdict === "noise"
            ? fmt(m.stats.summaryNoise, { revenue, change: f.change(ratio), compare })
            : fmt(verdict === "up" ? m.stats.summaryRealUp : m.stats.summaryRealDown, {
                revenue,
                change: f.change(ratio),
                compare,
              });

  // "Best" only when it is clearly ahead of the runner-up.
  const [first, second] = report.by_product
    .filter((p) => p.product_id && p.product_name && p.units > 0)
    .sort((a, b) => b.units - a.units);
  let product: string | null = null;
  if (first) {
    if (second && compareCounts(first.units, second.units) !== "up") {
      product = fmt(m.stats.summaryTie, { first: first.product_name!, second: second.product_name! });
    } else {
      const bestVerdict = compareSince(first.units, first.prev_units, first.first_sale, report.prev_start);
      const bestRatio = changeRatio(first.units, first.prev_units);
      product =
        bestRatio !== null && (bestVerdict === "up" || bestVerdict === "down")
          ? fmt(m.stats.summaryBestChange, { product: first.product_name!, change: f.change(bestRatio), compare })
          : fmt(m.stats.summaryBest, { product: first.product_name! });
    }
  }

  return { headline, product };
}

function ProductRanking({
  rows,
  prevStart,
  m,
  f,
}: {
  rows: StatsReport["by_product"];
  prevStart: string;
  m: Awaited<ReturnType<typeof getI18n>>["m"];
  f: Awaited<ReturnType<typeof getI18n>>["f"];
}) {
  if (rows.length === 0) return <p className="surface-card px-5 py-5 text-sm text-muted-foreground">{m.stats.noSales}</p>;

  // Same card and rows as RowList, but an ordered list: the order is the point.
  return (
    <ol className="surface-card flex flex-col p-2">
      {rows.map((row, i) => (
        <li key={row.product_id}>
          <ListRow
            leading={
              <span className="flex shrink-0 items-center gap-2.5">
                <span className="tabular-nums w-4 text-center text-[13px] font-semibold text-muted-foreground">{i + 1}</span>
                <ProductAvatar row={row} />
              </span>
            }
            title={row.product_name}
            subtitle={<span className="tabular">{plural(row.units, m.common.unitsOne, m.common.unitsOther)}</span>}
            value={f.euro(row.revenue)}
            valueSub={
              <Delta
                current={row.units}
                previous={row.prev_units}
                f={f}
                verdict={compareSince(row.units, row.prev_units, row.first_sale, prevStart)}
                noiseLabel={m.stats.withinNoise}
                sameLabel={m.stats.aboutSame}
                newLabel={row.first_sale ? fmt(m.stats.newSince, { date: f.dayMonth(row.first_sale) }) : undefined}
                className="text-[13px]"
              />
            }
          />
        </li>
      ))}
    </ol>
  );
}

/** The product's photo in a round token; its first letter without one, a link icon when not yet linked. */
function ProductAvatar({ row }: { row: StatsReport["by_product"][number] }) {
  return (
    <Avatar>
      {row.photo_path ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaUrl(row.photo_path)!} alt="" className="max-h-7 max-w-7 object-contain" />
      ) : row.product_id ? (
        initial(row.product_name ?? "")
      ) : (
        <Link2 />
      )}
    </Avatar>
  );
}
