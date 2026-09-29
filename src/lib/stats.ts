import type { StatsReport } from "@/lib/types";

// How Vendly decides whether a change means something.
//
// Sales arrive one at a time, so chance alone makes a count of n wobble by
// about √n. Food wobbles more than dice: weather, holidays, a slot that stood
// empty. Measured on MATO's own weekly sales per machine (April–September 2026),
// the week-to-week swing is about four times what pure chance gives, so Vendly
// counts with four times the variance. A change is real when it is more than
// 1.96 standard deviations from nothing — the usual 95% line.

/** Below this many sales in the two periods together, Vendly draws no conclusion. */
export const MIN_SALES = 30;
/** Variance of food sales relative to pure chance, measured on MATO's data. */
export const DISPERSION = 4;
/** Weekday patterns need every weekday a few times over. */
export const MIN_WEEKS = 4;

const Z95 = 1.96;
/** One-sided 5%/7: the best of seven weekdays has to clear a higher bar. */
const Z_BEST_OF_7 = 2.45;

export type Verdict = "tooFew" | "noise" | "up" | "down";

/** Compare two sales counts over equally long periods. */
export function compareCounts(current: number, previous: number): Verdict {
  if (current + previous < MIN_SALES) return "tooFew";
  const z = (current - previous) / Math.sqrt(DISPERSION * (current + previous));
  return z >= Z95 ? "up" : z <= -Z95 ? "down" : "noise";
}

/** The smallest relative change that counts as real when both periods sold about n. */
export function detectableChange(n: number): number {
  return (Z95 * Math.sqrt(DISPERSION * 2 * n)) / n;
}

const dayFormats = new Map<string, Intl.DateTimeFormat>();
function localDay(instant: string | number | Date, timeZone: string): string {
  let format = dayFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    dayFormats.set(timeZone, format);
  }
  return format.format(new Date(instant));
}

/**
 * A moment as the calendar day it falls on where the business stands. Slicing
 * an ISO string instead reads the day in UTC, which in Belgian summer is two
 * hours behind — a September report would announce itself as starting on
 * 31 August.
 */
export function reportDay(instant: string | number | Date, timeZone: string): string {
  return localDay(instant, timeZone);
}

/** Every calendar day the report covers, in its own time zone ("2026-09-21"). */
export function periodDays(report: StatsReport): string[] {
  const first = localDay(report.cur_start, report.timezone);
  const last = localDay(new Date(report.cur_end).getTime() - 1, report.timezone);
  const days: string[] = [];
  for (let d = new Date(`${first}T00:00:00Z`); d <= new Date(`${last}T00:00:00Z`); d = new Date(d.getTime() + 86_400_000)) {
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

/** by_day with the days that sold nothing put back in, so a chart never skips a zero. */
export function fillDays(report: StatsReport): StatsReport["by_day"] {
  const byDay = new Map(report.by_day.map((d) => [d.day, d]));
  return periodDays(report).map((day) => byDay.get(day) ?? { day, revenue: 0, units: 0 });
}

const isoWeekday = (day: string) => ((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7) + 1; // Monday = 1

export type WeekdayStat = { weekday: number; days: number; units: number; revenue: number; avgRevenue: number };

/**
 * Sales per weekday as an average per such day. Totals would be unfair: a month
 * can hold five Mondays and four Sundays.
 */
export function weekdayStats(report: StatsReport): WeekdayStat[] {
  const days = periodDays(report);
  return [1, 2, 3, 4, 5, 6, 7].map((weekday) => {
    const count = days.filter((d) => isoWeekday(d) === weekday).length;
    const row = report.by_weekday.find((w) => w.weekday === weekday);
    const revenue = row?.revenue ?? 0;
    return { weekday, days: count, units: row?.units ?? 0, revenue, avgRevenue: count ? revenue / count : 0 };
  });
}

/**
 * The weekday that really sells more than the others, if there is one: every
 * weekday seen at least MIN_WEEKS times, and its sales clearly above what an
 * ordinary day would give in the same number of days.
 */
export function busiestWeekday(report: StatsReport): { weekday: number; pct: number } | null {
  const stats = weekdayStats(report);
  if (stats.some((s) => s.days < MIN_WEEKS)) return null;

  const totalDays = stats.reduce((sum, s) => sum + s.days, 0);
  const totalUnits = stats.reduce((sum, s) => sum + s.units, 0);
  if (totalUnits < MIN_SALES * 2) return null;

  // Picking the best of seven and then testing it would find a "best day" by
  // luck far too often, so the bar is raised for seven tries (Bonferroni, 5%/7).
  const best = [...stats].sort((a, b) => b.units / b.days - a.units / a.days)[0];
  const expected = (totalUnits * best.days) / totalDays;
  const z = (best.units - expected) / Math.sqrt(DISPERSION * expected);
  if (z < Z_BEST_OF_7) return null;

  const avgDayRevenue = stats.reduce((sum, s) => sum + s.revenue, 0) / totalDays;
  return avgDayRevenue > 0 ? { weekday: best.weekday, pct: Math.round((best.avgRevenue / avgDayRevenue - 1) * 100) } : null;
}

/** The last n full weeks (Monday to Sunday) before the current one, as dates for a custom report. */
export function lastFullWeeks(n: number, timeZone: string, now: Date = new Date()): { from: string; to: string } {
  const today = new Date(`${localDay(now, timeZone)}T00:00:00Z`);
  const monday = new Date(today.getTime() - ((today.getUTCDay() + 6) % 7) * 86_400_000);
  return {
    from: new Date(monday.getTime() - n * 7 * 86_400_000).toISOString().slice(0, 10),
    to: new Date(monday.getTime() - 86_400_000).toISOString().slice(0, 10),
  };
}

/**
 * What share of a product ends up in the bin, and whether that share is solid
 * enough to act on. Same arithmetic as the rest of Vendly: a proportion out of
 * n pieces wobbles by √(p(1−p)/n), and food wobbles four times harder than
 * chance. One piece out of two is not a 50% problem, and Vendly says so.
 */
export type WasteVerdict = "tooFew" | "small" | "worthActing";

/**
 * Is a share of n events really above `floor`, or could this many events have
 * landed there by chance? Same arithmetic as the rest of Vendly: a proportion
 * wobbles by √(p(1−p)/n), and real life wobbles four times harder. Small n is
 * not silenced outright — 30 failures out of 34 is a broken machine however
 * quiet it is — it simply has to be that much worse to count.
 */
export function shareIsReal(part: number, total: number, floor: number): boolean {
  if (total <= 0) return false;
  const share = part / total;
  const margin = Z95 * Math.sqrt((DISPERSION * share * (1 - share)) / total);
  return share - margin > floor;
}

/**
 * Floor for calling waste a problem. Fresh food in a machine always loses a
 * little; above three pieces in a hundred it is worth looking at. Vendly only
 * says so when the 95% interval clears that floor, so a slot that lost two
 * pieces out of forty stays quiet.
 */
const WASTE_FLOOR = 0.03;

export function wasteVerdict(expired: number, sold: number): WasteVerdict {
  const n = expired + sold;
  if (n < MIN_SALES) return "tooFew";
  return shareIsReal(expired, n, WASTE_FLOOR) ? "worthActing" : "small";
}
