// How often MATO Info may ask a UniFi console for a photo (22-10-2026, "faster
// photos, fewer failures, rate limits"). UniFi allows 100 calls a minute per
// console, and every camera on it shares them: MATO Info, the test site and
// the three client sites. No imports, so the server, the camera block in the
// browser and the tests all read the same numbers.

/** Calls a minute MATO Info takes per console, below UniFi's 100: the client sites keep the rest. */
export const CONSOLE_BUDGET = 80;

/** Everyone who asks for the same camera within this time gets the same photo, as on the client sites. */
export const SHARE_MS = 2_500;

/** Live never asks more often than this, whatever the server says. */
export const LIVE_EVERY_MS = 3_000;

/** The response header that tells Live how long to wait for its next photo, in milliseconds. */
export const NEXT_HEADER = "X-Camera-Next";

/**
 * The wait before the next Live photo, from the calls this console already took
 * this minute: every 3 s while it is quiet, slower as the minute fills, so a few
 * people watching at once slow down together instead of running into UniFi's wall.
 */
export function liveInterval(usedThisMinute: number): number {
  if (usedThisMinute < CONSOLE_BUDGET / 2) return LIVE_EVERY_MS;
  if (usedThisMinute < (CONSOLE_BUDGET * 3) / 4) return 5_000;
  return 8_000;
}

/** Milliseconds until the next whole minute, when the console's budget starts again. */
export function msToNextMinute(now: number = Date.now()): number {
  return 60_000 - (now % 60_000);
}

/**
 * How long UniFi asked to wait, from its Retry-After header: seconds or a date.
 * Without a usable answer, ten seconds; never more than a minute.
 */
export function retryAfterMs(header: string | null, now: number = Date.now()): number {
  const value = header?.trim() ?? "";
  const seconds = /^\d+$/.test(value) ? Number(value) * 1000 : value ? Date.parse(value) - now : NaN;
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 60_000) : 10_000;
}

/**
 * One fetch per key at a time: whoever asks while a photo is on its way, or
 * within SHARE_MS of asking for it, gets that same photo. Counted from when it
 * was asked, so someone on Live every 3 s always gets a new one. A failed fetch
 * is never handed on: the next one asks again.
 */
export function sharing<A, T>(keyOf: (arg: A) => string, get: (arg: A) => Promise<T>, now: () => number = Date.now) {
  const recent = new Map<string, { at: number; value: Promise<T> }>();
  return async (arg: A): Promise<{ value: T; shared: boolean }> => {
    const key = keyOf(arg);
    const hit = recent.get(key);
    if (hit && now() - hit.at < SHARE_MS) return { value: await hit.value, shared: true };
    const value = get(arg);
    recent.set(key, { at: now(), value });
    value.catch(() => {
      if (recent.get(key)?.value === value) recent.delete(key);
    });
    return { value: await value, shared: false };
  };
}
