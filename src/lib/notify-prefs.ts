// Instellingen → Meldingen (23-10-2026, Xin: "put notifications on and send them on email or sms and also filter what
// they notifications about"): per topic whether one person gets it. Pure, without imports: the page, the action and the
// tests share it, and supabase/functions/vendly-alerts reads the same columns of notification_prefs.

export const NOTIFY_TOPICS = ["daily", "weekly", "sales", "errors", "low_stock"] as const;
export type NotifyTopic = (typeof NOTIFY_TOPICS)[number];
// Email only (Xin, 23-10-2026: "remove push but focus more on email", then "i dont wnat to activate sms"). Kept as a list
// of channels per topic, as the columns are, should another ever come back.
export const NOTIFY_CHANNELS = ["email"] as const;
export type NotifyChannel = (typeof NOTIFY_CHANNELS)[number];
/** How empty a machine may get before "almost empty" says so. */
export const LOW_PERCENTS = [10, 20, 25, 30, 40, 50] as const;

export type NotifyPrefs = {
  email: string | null;
  topics: Record<NotifyTopic, NotifyChannel[]>;
  /** The hour of the day's overview (and, on Monday, the week's), Brussels time. */
  dailyHour: number;
  lowPercent: number;
};

/** Before anyone chose: the evening overview and errors by email. */
export const NOTIFY_DEFAULTS: NotifyPrefs = {
  email: null,
  topics: { daily: ["email"], weekly: [], sales: [], errors: ["email"], low_stock: [] },
  dailyHour: 20,
  lowPercent: 25,
};

/** An address that can take mail; empty is null, anything else unusable is false. */
export function normalizeEmail(input: string): string | null | false {
  const trimmed = input.trim();
  if (!trimmed) return null;
  return trimmed.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed.toLowerCase() : false;
}

const hour = (value: unknown, fallback: number) => (Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 23 ? (value as number) : fallback);

/** Every channel some topic goes out on. */
export function channelsInUse(topics: Record<NotifyTopic, NotifyChannel[]>): NotifyChannel[] {
  return NOTIFY_CHANNELS.filter((channel) => NOTIFY_TOPICS.some((topic) => topics[topic].includes(channel)));
}

export type CleanPrefs = { ok: true; prefs: NotifyPrefs } | { ok: false; reason: "email" | "emailMissing" };

/**
 * What came from the phone, made safe to store: only known topics and channels, an hour of the day, a listed limit.
 * An address that is filled in must work; any topic switched on needs one.
 */
export function cleanPrefs(input: unknown): CleanPrefs {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const email = normalizeEmail(typeof raw.email === "string" ? raw.email : "");
  if (email === false) return { ok: false, reason: "email" };

  const given = (raw.topics && typeof raw.topics === "object" ? raw.topics : {}) as Record<string, unknown>;
  const topics = Object.fromEntries(
    NOTIFY_TOPICS.map((topic) => {
      const list = Array.isArray(given[topic]) ? (given[topic] as unknown[]) : [];
      return [topic, NOTIFY_CHANNELS.filter((channel) => list.includes(channel))];
    }),
  ) as Record<NotifyTopic, NotifyChannel[]>;
  const used = channelsInUse(topics);
  if (used.includes("email") && !email) return { ok: false, reason: "emailMissing" };

  return {
    ok: true,
    prefs: {
      email,
      topics,
      dailyHour: hour(raw.dailyHour, NOTIFY_DEFAULTS.dailyHour),
      lowPercent: (LOW_PERCENTS as readonly number[]).includes(raw.lowPercent as number) ? (raw.lowPercent as number) : NOTIFY_DEFAULTS.lowPercent,
    },
  };
}
