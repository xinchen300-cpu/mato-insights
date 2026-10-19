import { fmt, type Formatters } from "@/i18n/format";
import { addDays, isoDay } from "@/lib/expiry";

/** "gevuld vandaag 09:42", "gevuld gisteren 18:10" or "gevuld di 14 okt": when a machine was last filled, in Belgian time. */
export function refilledText(
  at: string,
  t: { refilledToday: string; refilledYesterday: string; refilledOn: string },
  f: Formatters,
  now: Date = new Date(),
): string {
  const day = isoDay(new Date(at));
  if (day === isoDay(now)) return fmt(t.refilledToday, { time: f.time(at) });
  if (day === addDays(-1, now)) return fmt(t.refilledYesterday, { time: f.time(at) });
  return fmt(t.refilledOn, { day: f.weekdayDay(at) });
}
