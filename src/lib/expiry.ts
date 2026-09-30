const TIME_ZONE = "Europe/Brussels";

/** Chosen in the product form when a product sets its own days instead of a category. */
export const CUSTOM_SHELF_LIFE = "__custom__";

const isoFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** A date as "2026-09-25", read in Belgian time like the rest of MATO Insights. */
export function isoDay(date: Date): string {
  return isoFormat.format(date);
}

export function addDays(days: number, from: Date = new Date()): string {
  return isoDay(new Date(from.getTime() + days * 86_400_000));
}

/**
 * The last day of a month, n months ahead. Long-keeping food is stamped with a
 * month, so "10/2026" means good to the end of October.
 */
export function endOfMonth(monthsAhead: number, from: Date = new Date()): string {
  const [year, month] = isoDay(from).split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + monthsAhead + 1, 0));
  return target.toISOString().slice(0, 10);
}

export function isEndOfMonth(day: string): boolean {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate() === date;
}

/** Above this shelf life a month is precise enough, and quicker to pick. */
export const MONTH_MODE_DAYS = 60;

export function daysBetween(day: string, from: Date = new Date()): number {
  const [y, m, d] = day.split("-").map(Number);
  const [fy, fm, fd] = isoDay(from).split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}
