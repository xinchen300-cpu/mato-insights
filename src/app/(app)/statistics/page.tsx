import { Suspense } from "react";
import { Download } from "lucide-react";
import { BarList } from "@/components/charts/bar-list";
import { HourChart } from "@/components/charts/hour-chart";
import { RevenueChart } from "@/components/charts/revenue-chart";
import { Delta } from "@/components/delta";
import { EmptyState, PageHeader, Panel } from "@/components/page-header";
import { StatTile } from "@/components/stat-tile";
import { StatsGuide } from "@/components/stats-guide";
import { buttonVariants } from "@/components/ui/button";
import { changeRatio, fmt, plural } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { getBusinesses, getMachines, getProducts, getStatsReport } from "@/lib/data";
import { mediaUrl } from "@/lib/media";
import { requireOrgId } from "@/lib/org";
import { compareCounts, detectableChange, fillDays, MIN_WEEKS, periodDays, weekdayStats } from "@/lib/stats";
import { compareLabelKey, parseStatsParams, type StatsSearchParams } from "@/lib/stats-params";
import type { StatsReport } from "@/lib/types";
import { StatsFilters } from "./stats-filters";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.stats.title };
}


export default async function StatisticsPage({ searchParams }: { searchParams: Promise<StatsSearchParams> }) {
  const raw = await searchParams;
  const { m, f } = await getI18n();
  const orgId = await requireOrgId();
  const { period, from, to, business, machine, product, filters } = parseStatsParams(raw);

  const [report, machines, businesses, products] = await Promise.all([
    getStatsReport(orgId, filters),
    getMachines(orgId),
    getBusinesses(orgId),
    getProducts(orgId),
  ]);

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
  const unitsVerdict = compareCounts(totals.units, totals.prev_units);
  const verdictNotes = { tooFew: m.stats.tooFewToCompare, noise: m.stats.withinNoise };

  const exportParams = new URLSearchParams(
    Object.entries({ period, from, to, business, machine, product }).filter(([, v]) => v) as [string, string][],
  );

  const { headline, product: productLine } = summary(report, m, f, compare);

  return (
    <>
      <PageHeader
        title={m.stats.title}
        subtitle={m.stats.subtitle}
        actions={
          <a href={`/statistics/csv?${exportParams}`} className={buttonVariants({ variant: "outline" })}>
            <Download />
            {m.stats.export}
          </a>
        }
      />

      <div className="flex flex-col gap-6">
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
          <EmptyState title={m.stats.noSales} />
        ) : (
          <>
            <div className="max-w-3xl">
              <p className="figure font-heading text-xl leading-snug text-foreground sm:text-2xl">{headline}</p>
              {productLine && <p className="figure mt-1.5 text-sm text-muted-foreground">{productLine}</p>}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatTile
                label={m.stats.revenue}
                value={f.euro(totals.revenue)}
                current={totals.revenue}
                previous={totals.prev_revenue}
                compareLabel={compare}
                verdict={unitsVerdict}
                verdictNotes={verdictNotes}
                f={f}
              />
              <StatTile
                label={m.stats.units}
                value={f.number(totals.units)}
                current={totals.units}
                previous={totals.prev_units}
                compareLabel={compare}
                verdict={unitsVerdict}
                verdictNotes={verdictNotes}
                f={f}
              />
              <StatTile
                label={m.stats.avgSale}
                value={f.euro(avg)}
                detail={prevAvg > 0 ? fmt(m.stats.avgBefore, { amount: f.euro(prevAvg) }) : undefined}
                f={f}
              />
            </div>

            <StatsGuide m={m} f={f} />

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

            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title={m.stats.bestSellers}>
                <ProductRanking rows={best} m={m} f={f} />
              </Panel>
              <Panel title={m.stats.worstSellers} hint={longEnough ? m.stats.worstSellersHint : undefined}>
                {longEnough ? (
                  <ProductRanking rows={slowest} m={m} f={f} />
                ) : (
                  <p className="text-sm text-muted-foreground">{fmt(m.stats.worstSellersTooShort, { days })}</p>
                )}
              </Panel>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
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
                  highlightTop={weekdays.every((w) => w.days >= MIN_WEEKS)}
                />
              </Panel>
              <Panel title={m.stats.busiestHours}>
                <HourChart data={report.by_hour} />
              </Panel>
            </div>

            <Panel title={m.stats.perMachine}>
              <ul className="flex flex-col divide-y">
                {report.by_machine.map((row) => (
                  <li
                    key={row.machine_id}
                    className="grid grid-cols-[1fr_auto] items-center gap-x-4 py-3 sm:grid-cols-[1fr_7rem_8rem_5rem]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{row.machine_name}</span>
                      <span className="block text-xs text-muted-foreground sm:hidden">
                        {plural(row.units, m.common.unitsOne, m.common.unitsOther)}
                      </span>
                    </span>
                    <span className="tabular hidden text-right text-sm text-muted-foreground sm:block">
                      {plural(row.units, m.common.unitsOne, m.common.unitsOther)}
                    </span>
                    <span className="tabular text-right font-semibold">{f.euro(row.revenue)}</span>
                    <span className="col-span-2 text-right sm:col-span-1">
                      <Delta
                        current={row.revenue}
                        previous={row.prev_revenue}
                        f={f}
                        verdict={compareCounts(row.units, row.prev_units)}
                        noiseLabel={m.stats.withinNoise}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title={m.stats.perProduct}>
              <ul className="flex flex-col divide-y">
                {report.by_product
                  .filter((p) => p.units > 0)
                  .map((row) => (
                    <li
                      key={row.product_id ?? "unassigned"}
                      className="grid grid-cols-[2rem_1fr_auto] items-center gap-x-3 py-2.5 sm:grid-cols-[2rem_1fr_7rem_8rem_5rem]"
                    >
                      <span className="grid size-8 place-items-center">
                        {row.photo_path && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={mediaUrl(row.photo_path)!} alt="" className="max-h-8 max-w-8 object-contain" />
                        )}
                      </span>
                      <span className={row.product_id ? "truncate font-semibold" : "truncate italic text-muted-foreground"}>
                        {row.product_name ?? m.stats.unassignedProduct}
                      </span>
                      <span className="tabular hidden text-right text-sm text-muted-foreground sm:block">
                        {plural(row.units, m.common.unitsOne, m.common.unitsOther)}
                      </span>
                      <span className="tabular text-right font-semibold">{f.euro(row.revenue)}</span>
                      <span className="hidden text-right sm:block">
                        <Delta
                        current={row.revenue}
                        previous={row.prev_revenue}
                        f={f}
                        verdict={compareCounts(row.units, row.prev_units)}
                        noiseLabel={m.stats.withinNoise}
                      />
                      </span>
                    </li>
                  ))}
              </ul>
            </Panel>
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
  const verdict = compareCounts(totals.units, totals.prev_units);
  const unitRatio = changeRatio(totals.units, totals.prev_units);
  // The verdict counts pieces, the percentage counts euros, and the two can
  // point opposite ways when the mix shifts. Saying "a real increase" above a
  // minus sign is the kind of nonsense MATO Insights exists to avoid, so when they
  // disagree the sentence says what actually happened instead.
  const mixShift =
    ratio !== null && unitRatio !== null && (verdict === "up" || verdict === "down") && ratio * unitRatio < 0;

  const headline =
    ratio === null
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
      const bestVerdict = compareCounts(first.units, first.prev_units);
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
  m,
  f,
}: {
  rows: StatsReport["by_product"];
  m: Awaited<ReturnType<typeof getI18n>>["m"];
  f: Awaited<ReturnType<typeof getI18n>>["f"];
}) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{m.stats.noSales}</p>;

  return (
    <ol className="flex flex-col gap-2.5">
      {rows.map((row, i) => (
        <li key={row.product_id} className="grid grid-cols-[1.25rem_2rem_1fr_auto] items-center gap-3">
          <span className="font-mono text-xs font-bold text-muted-foreground">{i + 1}</span>
          <span className="grid size-8 place-items-center">
            {row.photo_path && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaUrl(row.photo_path)!} alt="" className="max-h-8 max-w-8 object-contain" />
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold">{row.product_name}</span>
            <span className="block text-xs text-muted-foreground">
              {plural(row.units, m.common.unitsOne, m.common.unitsOther)}
            </span>
          </span>
          <span className="flex flex-col items-end">
            <span className="tabular font-semibold">{f.euro(row.revenue)}</span>
            <Delta
              current={row.units}
              previous={row.prev_units}
              f={f}
              verdict={compareCounts(row.units, row.prev_units)}
              noiseLabel={m.stats.withinNoise}
              className="text-xs"
            />
          </span>
        </li>
      ))}
    </ol>
  );
}
