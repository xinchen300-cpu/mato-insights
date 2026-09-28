import type { StatsFilters } from "@/lib/data";
import { PERIODS, type Period } from "@/lib/types";

export type StatsSearchParams = {
  period?: string;
  from?: string;
  to?: string;
  business?: string;
  machine?: string;
  product?: string;
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

  const filters: StatsFilters = {
    period: period === "custom" && (!from || !to) ? "last30" : period,
    from,
    to,
    businesses: business ? [business] : null,
    machines: machine ? [machine] : null,
    products: product ? [product] : null,
  };
  return { period, from, to, business, machine, product, filters };
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
