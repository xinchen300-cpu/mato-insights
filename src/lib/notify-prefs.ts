// Instellingen → Meldingen (23-10-2026, Xin: "put notifications on and send them on email or sms and also filter what
// they notifications about"): per topic the channels one person chose. Pure, without imports: the page, the action
// and the tests share it, and supabase/functions/vendly-alerts reads the same columns of notification_prefs.

export const NOTIFY_TOPICS = ["daily", "weekly", "sales", "errors", "low_stock"] as const;
export type NotifyTopic = (typeof NOTIFY_TOPICS)[number];
export const NOTIFY_CHANNELS = ["push", "email", "sms"] as const;
export type NotifyChannel = (typeof NOTIFY_CHANNELS)[number];
/** How empty a machine may get before "almost empty" says so. */
export const LOW_PERCENTS = [10, 20, 25, 30, 40, 50] as const;

export type NotifyPrefs = {
  email: string | null;
  phone: string | null;
  topics: Record<NotifyTopic, NotifyChannel[]>;
  /** The hour of the day's overview (and, on Monday, the week's), Brussels time. */
  dailyHour: number;
  lowPercent: number;
  quiet: boolean;
  quietFrom: number;
  quietTo: number;
};

/** Before anyone chose: the evening overview and errors on their phone, as the evening line did. */
export const NOTIFY_DEFAULTS: NotifyPrefs = {
  email: null,
  phone: null,
  topics: { daily: ["push"], weekly: [], sales: [], errors: ["push"], low_stock: [] },
  dailyHour: 20,
  lowPercent: 25,
  quiet: false,
  quietFrom: 22,
  quietTo: 7,
};

/**
 * A number as people type it ("0470 12 34 56", "+32 470 12 34 56", "0032…") in the form a text message needs
 * ("+32470123456"); a number without a country is Belgian. Empty is null, anything else unusable is false.
 */
export function normalizePhone(input: string): string | null | false {
  const compact = input.replace(/[\s./()-]/g, "");
  if (!compact) return null;
  const international = compact.startsWith("00") ? `+${compact.slice(2)}` : compact.startsWith("0") ? `+32${compact.slice(1)}` : compact;
  return /^\+[1-9]\d{7,14}$/.test(international) ? international : false;
}

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

export type CleanPrefs = { ok: true; prefs: NotifyPrefs } | { ok: false; reason: "email" | "phone" | "emailMissing" | "phoneMissing" };

/**
 * What came from the phone, made safe to store: only known topics and channels, hours of the day, a listed limit.
 * An address or number that is filled in must work; mail or sms chosen somewhere needs one.
 */
export function cleanPrefs(input: unknown): CleanPrefs {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const email = normalizeEmail(typeof raw.email === "string" ? raw.email : "");
  if (email === false) return { ok: false, reason: "email" };
  const phone = normalizePhone(typeof raw.phone === "string" ? raw.phone : "");
  if (phone === false) return { ok: false, reason: "phone" };

  const given = (raw.topics && typeof raw.topics === "object" ? raw.topics : {}) as Record<string, unknown>;
  const topics = Object.fromEntries(
    NOTIFY_TOPICS.map((topic) => {
      const list = Array.isArray(given[topic]) ? (given[topic] as unknown[]) : [];
      return [topic, NOTIFY_CHANNELS.filter((channel) => list.includes(channel))];
    }),
  ) as Record<NotifyTopic, NotifyChannel[]>;
  const used = channelsInUse(topics);
  if (used.includes("email") && !email) return { ok: false, reason: "emailMissing" };
  if (used.includes("sms") && !phone) return { ok: false, reason: "phoneMissing" };

  return {
    ok: true,
    prefs: {
      email,
      phone,
      topics,
      dailyHour: hour(raw.dailyHour, NOTIFY_DEFAULTS.dailyHour),
      lowPercent: (LOW_PERCENTS as readonly number[]).includes(raw.lowPercent as number) ? (raw.lowPercent as number) : NOTIFY_DEFAULTS.lowPercent,
      quiet: raw.quiet === true,
      quietFrom: hour(raw.quietFrom, NOTIFY_DEFAULTS.quietFrom),
      quietTo: hour(raw.quietTo, NOTIFY_DEFAULTS.quietTo),
    },
  };
}
