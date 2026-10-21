import { Suspense } from "react";
import { ArrowRight, ChartNoAxesColumn, ChevronRight, Link2, TriangleAlert } from "lucide-react";
import { BarList } from "@/components/charts/bar-list";
import { HourChart } from "@/components/charts/hour-chart";
import { RevenueChart } from "@/components/charts/revenue-chart";
import { Delta } from "@/components/delta";
import { KpiHero, MiniStat } from "@/components/kpi";
import { Avatar, ListRow, RowList, initial } from "@/components/list-row";
import { EmptyState, PageHeader, Panel, Section } from "@/components/page-header";
import { StatsGuide } from "@/components/stats-guide";
import { fmt, plural } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import Link from "next/link";
import { getBusinesses, getMachines, getOrgName, getPriceMismatches, getProducts, getRefillVisits, getStatsReport } from "@/lib/data";
import { withoutOrgName } from "@/lib/overview";
import { RefillLog } from "@/components/stats/refill-log";
import { mediaUrl } from "@/lib/media";
import { isFiller, requireOrgId, requireRefillAccess } from "@/lib/org";
import {
  busiestWeekday,
  compareMoneySince,
  compareSince,
  fillDays,
  MIN_WEEKS,
  periodDays,
  reportDay,
  weekdayStats,
} from "@/lib/stats";
import { compareLabelKey, parseStatsParams, type StatsSearchParams } from "@/lib/stats-params";
import type { StatsReport } from "@/lib/types";
import { ExportMenu } from "./export-menu";
import { FillerSales } from "./filler-sales";
import { LeastPerMachine } from "./least-per-machine";
import { MonthlyOverview, MonthlySkeleton } from "./monthly";
import { StatsFilters } from "./stats-filters";
import { MachineIcon } from "@/components/machine/machine-icon";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.stats.title };
}


export default async function StatisticsPage({ searchParams }: { searchParams: Promise<StatsSearchParams> }) {
  // A filler gets what sells and when, in pieces and without money.
  if (await isFiller()) {
    const fillerOrg = await requireRefillAccess();
    return <FillerSales orgId={fillerOrg} month={(await searchParams).month} />;
  }
  const raw = await searchParams;
  const { m, f } = await getI18n();
  const orgId = await requireOrgId();
  const { period, from, to, business, machine, product, year, thisYear, filters } = parseStatsParams(raw);

  const [report, machines, businesses, products, mismatches, orgName] = await Promise.all([
    getStatsReport(orgId, filters),
    getMachines(orgId),
    getBusinesses(orgId),
    getProducts(orgId),
    getPriceMismatches(orgId),
    getOrgName(orgId),
  ]);
  // When each machine was filled in the same period, how many and at what time (Xin, 20-10-2026): the owner's only.
  const visitMachines = machine
    ? [machine]
    : business
      ? machines.filter((mc) => mc.business_id === business || mc.shared_business_id === business).map((mc) => mc.id)
      : null;
  const visits = await getRefillVisits(orgId, { from: report.cur_start, to: report.cur_end }, visitMachines);
  // "Koekelare" rather than "Koekelare Chens Garden": every machine here is the organisation's own.
  const machineNames = new Map(machines.map((mc) => [mc.id, withoutOrgName(mc.name, orgName)]));

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

  const named = report.by_product.filter((p) => p.product_id);
  // Sorted here on purpose: the headline above ranks by pieces, so this panel
  // must too, or the same screen names two different best sellers.
  const best = named
    .filter((p) => p.units > 0)
    .sort((a, b) => b.units - a.units || b.revenue - a.revenue)
    .slice(0, 5);
  // Judging a product slow takes whole weeks: fewer and it is mostly luck.
  const periodDayList = periodDays(report);
  const longEnough = periodDayList.length >= MIN_WEEKS * 7;
  // Minst verkocht per automaat (Xin, 21-10-2026), for the machines the filters leave: one asked, a business's, or all.
  const leastMachines = (machine ? machines.filter((mc) => mc.id === machine) : visitMachines ? machines.filter((mc) => visitMachines.includes(mc.id)) : machines).map(
    (mc) => ({ id: mc.id, name: machineNames.get(mc.id) ?? mc.name }),
  );
  // Today's layout only says what was in a machine while the period runs up to today.
  const includesNow = periodDayList.at(-1) === reportDay(new Date(), report.timezone);
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
  // These arrows show money; see compareMoneySince for why a mix shift is grey.
  const moneyVerdict = (row: {
    units: number;
    prev_units: number;
    revenue: number;
    prev_revenue: number;
    first_sale: string | null;
  }) => compareMoneySince(row.units, row.prev_units, row.revenue, row.prev_revenue, row.first_sale, report.prev_start);
  const unitsVerdict = since({ ...totals, first_sale: report.first_sale });
  const verdictNotes = { tooFew: m.stats.tooFewToCompare, noise: m.stats.withinNoise, same: m.stats.aboutSame, new: newSince(report.first_sale) };

  const exportParams = new URLSearchParams(
    Object.entries({ period, from, to, business, machine, product }).filter(([, v]) => v) as [string, string][],
  );

  // Statistics → Exporteren: the period shown, by name, and the other filters kept as they are.
  const today = reportDay(new Date(), report.timezone);
  const wholeMonth =
    filters.period === "custom" && from && to && from.endsWith("-01") && to.slice(0, 7) === from.slice(0, 7) && reportDay(new Date(`${to}T12:00:00Z`).getTime() + 86_400_000, "UTC").endsWith("-01");
  const shownLabel =
    filters.period !== "custom"
      ? m.periods[filters.period]
      : wholeMonth
        ? f.monthLongYear(from.slice(0, 7))
        : `${f.dayMonth(`${from}T12:00:00Z`)} – ${f.dayMonth(`${to}T12:00:00Z`)}`;
  const keepParams = new URLSearchParams(
    Object.entries({ business, machine, product }).filter(([, v]) => v) as [string, string][],
  );
  const keepLabel =
    [
      business ? businesses.find((b) => b.id === business)?.name : null,
      machine ? machineNames.get(machine) : null,
      product ? products.find((p) => p.id === product)?.name : null,
    ]
      .filter(Boolean)
      .join(" · ") || null;

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
          <ExportMenu
            shown={{ period: filters.period, from: filters.period === "custom" ? from : null, to: filters.period === "custom" ? to : null }}
            shownLabel={shownLabel}
            keep={keepParams.toString()}
            keepLabel={keepLabel}
            firstDay={report.first_sale ? reportDay(report.first_sale, report.timezone) : today}
            today={today}
          />
        }
      />

      <div className="flex flex-col gap-8 sm:gap-10">
        <Suspense>
          <StatsFilters
            // A month picked or dates applied start the date fields over from the address.
            key={`${period}|${from}|${to}`}
            period={period}
            from={from}
            to={to}
            business={business}
            machine={machine}
            product={product}
            businesses={businesses.map((b) => ({ id: b.id, name: b.name }))}
            machines={machines.map((mc) => ({
              id: mc.id,
              name: machineNames.get(mc.id) ?? mc.name,
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
            {/* The one figure this page is about, two beside it, then the curve. */}
            <section className="surface-card px-5 pb-4 pt-6 sm:px-8 sm:pb-6 sm:pt-8">
              <KpiHero
                label={m.stats.revenue}
                value={f.euro(totals.revenue)}
                compare={{
                  current: totals.revenue,
                  previous: totals.prev_revenue,
                  label: compare,
                  verdict: moneyVerdict({ ...totals, first_sale: report.first_sale }),
                  notes: verdictNotes,
                }}
                f={f}
              />

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

            {/* Money machine by machine, right under the total (Xin, 20-10-2026). */}
            <Section title={m.stats.perMachine}>
              <RowList>
                {report.by_machine.map((row) => (
                  <li key={row.machine_id}>
                    <ListRow
                      leading={<Avatar><MachineIcon /></Avatar>}
                      title={withoutOrgName(row.machine_name, orgName)}
                      subtitle={<span className="tabular">{plural(row.units, m.common.unitsOne, m.common.unitsOther)}</span>}
                      value={f.euro(row.revenue)}
                      valueSub={
                        <Delta
                          current={row.revenue}
                          previous={row.prev_revenue}
                          f={f}
                          verdict={moneyVerdict(row)}
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

            {/* When each machine was filled, with how many and at what time. */}
            {visits.length > 0 && <RefillLog visits={visits} names={machineNames} m={m} f={f} />}

            {/* Said once, right above the product figures it is about. */}
            {scrambled.length > 0 && (
              <div className="surface-card flex items-start gap-3.5 p-4 sm:p-5">
                <Avatar tone="warning">
                  <TriangleAlert />
                </Avatar>
                <div className="min-w-0 pt-0.5">
                  <p className="max-w-[62ch] text-[15px] leading-snug">{fmt(m.stats.mixedBody, { machines: scrambled.join(", ") })}</p>
                  <Link
                    href="/unassigned"
                    className="-mx-1 mt-1.5 inline-flex items-center gap-1 rounded-full px-1 py-1 text-sm font-semibold text-foreground underline-offset-4 hover:underline"
                  >
                    {m.stats.mixedFix}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            )}

            {/* What sold best first; what sold least is per machine below (Xin, 21-10-2026), and only once
                the period is long enough to call anything slow. */}
            <Section title={m.stats.bestSellers}>
              <ProductRanking rows={best} prevStart={report.prev_start} m={m} f={f} />
            </Section>
            {!product &&
              (longEnough ? (
                <Suspense>
                  <LeastPerMachine orgId={orgId} filters={filters} machines={leastMachines} includesNow={includesNow} m={m} f={f} />
                </Suspense>
              ) : (
                <Section title={m.stats.leastPerMachine}>
                  <p className="surface-card px-5 py-4 text-[14px] text-muted-foreground">{fmt(m.stats.leastTooShort, { weeks: MIN_WEEKS })}</p>
                </Section>
              ))}



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

            {monthly}

            {/* Every product, folded: the best and slowest above say most of it. */}
            <details className="group">
              <summary className="flex h-12 cursor-pointer list-none items-center gap-1.5 px-1 text-[16px] font-semibold [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden="true" />
                {fmt(m.stats.productsAll, { n: report.by_product.filter((p) => p.units > 0).length })}
              </summary>
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
                            verdict={moneyVerdict(row)}
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
            </details>

            {/* How to read all this, for whoever wants to: at the foot, one row until opened. */}
            <StatsGuide m={m} f={f} />
          </>
        )}
      </div>
    </>
  );
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

