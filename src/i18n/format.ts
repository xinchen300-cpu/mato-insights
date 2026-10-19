import { intlLocale, type Locale } from "./config";

// All MATO machines are in Belgium; per-org time zones can come later.
export const DISPLAY_TIME_ZONE = "Europe/Brussels";

export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

export function plural(count: number, one: string, other: string): string {
  return count === 1 ? one : fmt(other, { count });
}

/** "42 min" or "1 u 05 min": how long a round took, from its minutes. */
export function duration(minutes: number, short: string, long: string): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return fmt(short, { minutes: total });
  return fmt(long, { hours: Math.floor(total / 60), minutes: String(total % 60).padStart(2, "0") });
}

export type Formatters = ReturnType<typeof makeFormatters>;

export function makeFormatters(locale: Locale) {
  const tag = intlLocale[locale];
  const timeZone = DISPLAY_TIME_ZONE;

  const euro = new Intl.NumberFormat(tag, { style: "currency", currency: "EUR" });
  const euroRound = new Intl.NumberFormat(tag, {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
  const number = new Intl.NumberFormat(tag);
  const change = new Intl.NumberFormat(tag, {
    style: "percent",
    maximumFractionDigits: 0,
    signDisplay: "exceptZero",
  });
  const percent = new Intl.NumberFormat(tag, { style: "percent", maximumFractionDigits: 0 });
  const date = new Intl.DateTimeFormat(tag, { day: "numeric", month: "short", year: "numeric", timeZone });
  const dayMonth = new Intl.DateTimeFormat(tag, { day: "numeric", month: "short", timeZone });
  const weekdayDay = new Intl.DateTimeFormat(tag, { weekday: "short", day: "numeric", month: "short", timeZone });
  const monthYear = new Intl.DateTimeFormat(tag, { month: "2-digit", year: "numeric", timeZone });
  const monthLong = new Intl.DateTimeFormat(tag, { month: "long", timeZone });
  const monthLongYear = new Intl.DateTimeFormat(tag, { month: "long", year: "numeric", timeZone });
  const monthShort = new Intl.DateTimeFormat(tag, { month: "short", timeZone });
  const dateTime = new Intl.DateTimeFormat(tag, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
  const clock = new Intl.DateTimeFormat(tag, { hour: "2-digit", minute: "2-digit", timeZone });
  const relative = new Intl.RelativeTimeFormat(tag, { numeric: "auto" });

  return {
    euro: (value: number) => euro.format(value),
    euroRound: (value: number) => euroRound.format(value),
    number: (value: number) => number.format(value),
    /** Signed ratio: 0.12 -> "+12%". */
    change: (ratio: number) => change.format(ratio),
    percent: (ratio: number) => percent.format(ratio),
    date: (value: string | Date) => date.format(new Date(value)),
    dayMonth: (value: string | Date) => dayMonth.format(new Date(value)),
    /** "di 14 okt": a day with its weekday. A bare calendar day ("2026-10-14") is read at noon, so it stays that day. */
    weekdayDay: (value: string | Date) =>
      weekdayDay.format(typeof value === "string" && value.length === 10 ? new Date(`${value}T12:00:00Z`) : new Date(value)),
    /** "10/2026": enough for food that keeps for months. */
    monthYear: (value: string | Date) => monthYear.format(new Date(value)),
    /** A calendar month ("2026-09") by name: "september", "sep". */
    monthLong: (month: string) => monthLong.format(new Date(`${month}-15T12:00:00Z`)),
    /** "oktober 2026". */
    monthLongYear: (month: string) => monthLongYear.format(new Date(`${month}-15T12:00:00Z`)),
    monthShort: (month: string) => monthShort.format(new Date(`${month}-15T12:00:00Z`)),
    dateTime: (value: string | Date) => dateTime.format(new Date(value)),
    time: (value: string | Date) => clock.format(new Date(value)),
    /** "3 minutes ago", "yesterday", … Only render this on the server. */
    relative: (value: string | Date) => {
      const seconds = (new Date(value).getTime() - Date.now()) / 1000;
      const units: [Intl.RelativeTimeFormatUnit, number][] = [
        ["day", 86400],
        ["hour", 3600],
        ["minute", 60],
      ];
      for (const [unit, size] of units) {
        if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
      }
      return relative.format(Math.round(seconds), "second");
    },
  };
}

const weekdayFormat = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: DISPLAY_TIME_ZONE });
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Monday = 0 … Sunday = 6, in Belgian time (servers run on UTC). */
export function weekdayIndex(value: string | Date): number {
  return WEEKDAYS.indexOf(weekdayFormat.format(new Date(value)));
}

/** Change between two amounts as a ratio, or null when there's nothing to compare against. */
export function changeRatio(current: number, previous: number): number | null {
  if (!previous) return null;
  return (current - previous) / previous;
}
