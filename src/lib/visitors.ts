import {
  busiestWeekday,
  compareSince,
  MIN_SALES,
  MIN_WEEKS,
  periodDays,
  shareInterval,
  standoutHours,
  type Verdict,
  weekdayStats,
  type WeekdayStat,
} from "@/lib/stats";

// Bezoekers (22-10-2026, Xin: "track amount of people … how long they stay … how many purchases … when busiest,
// calmest"): what UniFi Protect's own person detection saw at each camera, against the Payter sales of the
// machines it looks at. protect_visitors_report does the counting; this decides what may be said about it, by the
// same rules as the sales (stats.ts). No server imports: the page and the tests share it.

/** One camera's visitors, as protect_visitors_report gives them. A visit is one person detection by Protect. */
export type CameraVisitors = {
  camera_id: string;
  visits: number;
  prev_visits: number;
  /** Visits left out: during a refill or correction at the camera's machines (a filler, not a customer). */
  refilling: number;
  first_event: string | null;
  last_event: string | null;
  events_24h: number;
  /** People crossing a line drawn in Protect, and people lingering in a loitering zone. */
  lines: number;
  prev_lines: number;
  loiters: number;
  by_day: { day: string; visits: number }[];
  by_hour: { hour: number; visits: number }[];
  by_weekday: { weekday: number; visits: number }[];
  /** Seconds at the camera, for visits with an end, under two hours. */
  duration: { n: number; p25: number | null; p50: number | null; p75: number | null };
  /**
   * Sales on the organisation's machines this camera looks at: all of them, those that fell inside any visit (how
   * well the camera sees), the visits with a sale in them, and the sales inside those. Null for a demo organisation
   * (made-up sales) or a camera with none of its machines.
   */
  sales: { total: number; seen: number; bought: number; attributed: number } | null;
};

export type VisitorsReport = {
  cur_start: string;
  cur_end: string;
  prev_start: string;
  timezone: string;
  demo: boolean;
  cameras: CameraVisitors[];
};

/** The periods the page offers, in days up to and including today. Each is compared with the same length before it. */
export const VISITOR_PERIODS = { today: 1, week: 7, month: 28, quarter: 91 } as const;
export type VisitorPeriod = keyof typeof VISITOR_PERIODS;

export function parseVisitorPeriod(value: string | undefined): VisitorPeriod {
  return value && value in VISITOR_PERIODS ? (value as VisitorPeriod) : "month";
}

/**
 * Below this share of a period's sales falling inside a visit, the camera misses
 * too many people to say who bought: every sale is a customer we know was there.
 */
export const SEEN_FLOOR = 0.9;

/** Visitors against the period before, or "new since" when the camera's first detection came after that began. */
export function visitsVerdict(camera: CameraVisitors, report: Pick<VisitorsReport, "prev_start">): Verdict {
  return compareSince(camera.visits, camera.prev_visits, camera.first_event, report.prev_start);
}

/** Every day of the period, a day without visits as 0, so a chart never skips one. */
export function visitDays(camera: CameraVisitors, report: VisitorsReport): { day: string; visits: number }[] {
  const byDay = new Map(camera.by_day.map((d) => [d.day, d.visits]));
  return periodDays(report).map((day) => ({ day, visits: byDay.get(day) ?? 0 }));
}

/**
 * Visits per hour of the day, as an average per day of the period (one day: the
 * count itself), and the hours that really stand out, if any.
 */
export function hourProfile(camera: CameraVisitors, report: VisitorsReport) {
  const days = periodDays(report).length;
  const counts = Array.from({ length: 24 }, (_, hour) => camera.by_hour.find((h) => h.hour === hour)?.visits ?? 0);
  return {
    perDay: counts.map((n, hour) => ({ hour, visits: days > 0 ? n / days : 0 })),
    ...standoutHours(counts, days),
  };
}

/** Visits per weekday as an average per such day, and the weekday that really draws more, by the sales' own test. */
export function weekdayProfile(camera: CameraVisitors, report: VisitorsReport): { days: WeekdayStat[]; busiest: number | null; enough: boolean } {
  const shaped = {
    cur_start: report.cur_start,
    cur_end: report.cur_end,
    timezone: report.timezone,
    by_weekday: camera.by_weekday.map((w) => ({ weekday: w.weekday, units: w.visits, revenue: w.visits })),
  };
  const days = weekdayStats(shaped);
  return { days, busiest: busiestWeekday(shaped)?.weekday ?? null, enough: days.every((d) => d.days >= MIN_WEEKS) };
}

export type Buying =
  /** No sales to compare with: a demo, or none of the camera's machines are this organisation's. */
  | { state: "none" }
  /** Fewer than MIN_SALES visits or sales: no share yet. */
  | { state: "tooFew" }
  /** The camera saw too few of the sales to trust who did not buy. */
  | { state: "missed"; seen: number }
  | {
      state: "ok";
      share: number;
      low: number;
      high: number;
      bought: number;
      lookedOnly: number;
      /** Sales per visit that bought. */
      perBuyer: number;
      seen: number;
    };

/**
 * Who bought, out of the people who came: only once there are MIN_SALES visits
 * and sales, and only when the camera saw at least SEEN_FLOOR of the sales, so a
 * camera that misses people never makes the machine look better than it sells.
 * With the 95% range, four times wider than chance, as everywhere in MATO Info.
 */
export function buying(camera: CameraVisitors): Buying {
  const sales = camera.sales;
  if (!sales) return { state: "none" };
  if (sales.total < MIN_SALES || camera.visits < MIN_SALES) return { state: "tooFew" };
  const seen = sales.seen / sales.total;
  if (seen < SEEN_FLOOR) return { state: "missed", seen };
  const bought = Math.min(sales.bought, camera.visits);
  const { low, high } = shareInterval(bought, camera.visits);
  return {
    state: "ok",
    share: bought / camera.visits,
    low,
    high,
    bought,
    lookedOnly: camera.visits - bought,
    perBuyer: bought > 0 ? sales.attributed / bought : 0,
    seen,
  };
}

/** The middle time at the camera, in seconds, once there are MIN_SALES visits with an end; null before. */
export function middleStay(camera: CameraVisitors): { p25: number; p50: number; p75: number; n: number } | null {
  const d = camera.duration;
  if (d.n < MIN_SALES || d.p25 === null || d.p50 === null || d.p75 === null) return null;
  return { p25: d.p25, p50: d.p50, p75: d.p75, n: d.n };
}

/** What the camera check says about one camera, most serious first. */
export type CameraCheck = "detectionOff" | "nothingToday" | "fine";

/**
 * Protect gates person detection in two places, the camera and its zone, and an
 * empty list never says which was off: so a camera set without "person" is
 * named, and one set right that saw nobody in 24 hours gets the hint about its zone.
 */
export function cameraCheck(detects: string[] | null, camera: Pick<CameraVisitors, "events_24h"> | undefined): CameraCheck {
  if (detects && !detects.includes("person")) return "detectionOff";
  if (!camera || camera.events_24h === 0) return "nothingToday";
  return "fine";
}
