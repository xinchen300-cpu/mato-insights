import { MonthChart } from "@/components/charts/month-chart";
import { Delta } from "@/components/delta";
import { Avatar, ListRow, RowList } from "@/components/list-row";
import { Section } from "@/components/page-header";
import { SegmentedLinks } from "@/components/segmented";
import { DISPLAY_TIME_ZONE, fmt, plural } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { getMonthlyReport, type StatsFilters } from "@/lib/data";
import { compareRates, reportDay } from "@/lib/stats";

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * A year month by month, side by side, for whoever wants to see in December
 * how each month went. Each month is compared with the one before it per day,
 * so February is not punished for being short, and only when both months were
 * whole: the first month of a machine and the month still running get no
 * percentage, because there is nothing fair to put next to them.
 */
export async function MonthlyOverview({
  orgId,
  filters,
  year,
  thisYear,
  params,
}: {
  orgId: string;
  filters: Pick<StatsFilters, "machines" | "businesses" | "products">;
  year: number;
  thisYear: number;
  /** The page's other filters, kept when switching year. */
  params: URLSearchParams;
}) {
  const { m, f } = await getI18n();
  const { months, firstSale } = await getMonthlyReport(orgId, filters, year);
  if (!firstSale) return null;

  const firstDay = reportDay(firstSale, DISPLAY_TIME_ZONE);
  const firstMonth = firstDay.slice(0, 7);
  const firstYear = Math.min(Number(firstDay.slice(0, 4)), year);
  const thisMonth = reportDay(new Date(), DISPLAY_TIME_ZONE).slice(0, 7);

  const inYear = months.filter((row) => row.month.startsWith(`${year}-`) && row.month >= firstMonth);
  const total = inYear.reduce((sum, row) => sum + row.revenue, 0);
  const units = inYear.reduce((sum, row) => sum + row.units, 0);

  const chart = Array.from({ length: 12 }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, "0")}`;
    const row = inYear.find((r) => r.month === month);
    return { key: month, label: f.monthShort(month).replace(".", ""), revenue: row?.revenue ?? 0, running: month === thisMonth };
  });

  const years = Array.from({ length: thisYear - firstYear + 1 }, (_, i) => firstYear + i);
  const yearHref = (y: number) => {
    const next = new URLSearchParams(params);
    if (y === thisYear) next.delete("year");
    else next.set("year", String(y));
    const query = next.toString();
    return query ? `/statistics?${query}` : "/statistics";
  };

  return (
    <Section
      title={m.stats.monthly}
      actions={
        years.length > 1 ? (
          <SegmentedLinks
            items={years.map((y) => ({ href: yearHref(y), label: String(y), active: y === year }))}
          />
        ) : undefined
      }
    >
      <div className="surface-card px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
        <p className="text-[13px] font-medium text-muted-foreground">
          {fmt(year === thisYear ? m.stats.monthlySoFar : m.stats.monthlyTotal, { year })}
        </p>
        <p className="tabular mt-1.5 text-[28px] font-semibold leading-none tracking-[-0.03em]">{f.euro(total)}</p>
        <p className="tabular mt-2 text-[13.5px] text-muted-foreground">
          {plural(units, m.common.salesOne, m.common.salesOther)}
        </p>
        <div className="-mx-2 mt-5 sm:-mx-3">
          <MonthChart data={chart} />
        </div>
      </div>

      {inYear.length > 0 && (
        <RowList>
          {inYear.map((row) => {
            const prev = months[months.indexOf(row) - 1];
            // Fair only when both months were whole and the selection already sold in the earlier one.
            const fair = row.complete && prev !== undefined && prev.month > firstMonth;
            const note = !row.complete
              ? m.stats.monthRunning
              : row.month === firstMonth
                ? fmt(m.stats.monthFrom, { date: f.dayMonth(firstSale) })
                : null;
            return (
              <li key={row.month}>
                <ListRow
                  leading={
                    <Avatar className="text-[12px] lowercase">{f.monthShort(row.month).replace(".", "")}</Avatar>
                  }
                  title={capitalize(f.monthLong(row.month))}
                  subtitle={
                    <span className="tabular">
                      {plural(row.units, m.common.salesOne, m.common.salesOther)}
                      {row.complete &&
                        row.units > 0 &&
                        ` · ${fmt(m.stats.perDay, { amount: f.euro(row.revenue / row.days) })}`}
                    </span>
                  }
                  value={f.euro(row.revenue)}
                  valueSub={
                    note ? (
                      <span className="font-medium text-muted-foreground">{note}</span>
                    ) : fair ? (
                      <Delta
                        current={row.revenue / row.days}
                        previous={prev.revenue / prev.days}
                        f={f}
                        verdict={compareRates(row.units, row.days, prev.units, prev.days)}
                        noiseLabel={m.stats.withinNoise}
                        sameLabel={m.stats.aboutSame}
                        className="text-[13px]"
                      />
                    ) : null
                  }
                />
              </li>
            );
          })}
        </RowList>
      )}
      <p className="px-1 text-xs text-muted-foreground">{m.stats.monthlyLegend}</p>
    </Section>
  );
}

export function MonthlySkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      <div className="skeleton mx-1 h-6 w-32" />
      <div className="surface-card flex flex-col gap-3 p-6">
        <div className="skeleton h-3.5 w-24" />
        <div className="skeleton h-8 w-40" />
        <div className="skeleton mt-3 h-40 w-full" />
      </div>
    </div>
  );
}
