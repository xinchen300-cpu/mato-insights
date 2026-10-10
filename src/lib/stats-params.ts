import type { StatsFilters } from "@/lib/data";
import { DISPLAY_TIME_ZONE } from "@/i18n/format";
import { reportDay } from "@/lib/stats";
import { PERIODS, type Period } from "@/lib/types";

export type StatsSearchParams = {
  period?: string;
  from?: string;
  to?: string;
  business?: string;
  machine?: string;
  product?: string;
  /** The year the month-by-month overview shows. */
  year?: string;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

export function parseStatsParams(params: StatsSearchParams) {
  const period: Period = PERIODS.includes(params.period as Period) ? (params.period as Period) : "month";
  const from = params.from && DATE.test(params.from) ? params.from : null;
  const to = params.to && DATE.test(params.to) ? params.to : null;
  const business = params.business && UUID.test(params.business) ? params.business : null;
  const machine = params.machine && UUID.test(params.machine) ? params.machine : null;
  const product = params.product && UUID.test(params.product) ? params.product : null;
  const thisYear = Number(reportDay(new Date(), DISPLAY_TIME_ZONE).slice(0, 4));
  const asked = params.year && /^\d{4}$/.test(params.year) ? Number(params.year) : thisYear;
  const year = Math.min(Math.max(asked, 2000), thisYear);

  const filters: StatsFilters = {
    period: period === "custom" && (!from || !to) ? "last30" : period,
    from,
    to,
    businesses: business ? [business] : null,
    machines: machine ? [machine] : null,
    products: product ? [product] : null,
  };
  return { period, from, to, business, machine, product, year, thisYear, filters };
}

export function compareLabelKey(period: Period) {
  return ({
    today: "compareToday",
    week: "compareWeek",
    month: "compareMonth",
    last30: "compareLast30",
    custom: "compareCustom",
  } as const)[period];
}
