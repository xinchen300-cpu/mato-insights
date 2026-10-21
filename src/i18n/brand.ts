import type { Messages } from "./messages";

const NAME = "MATO Info";
const made = new Map<string, Messages>();

/**
 * The texts with the organisation's own name for the app in place of "MATO Info" (21-10-2026, the demo account:
 * "MATO"). Made once per language and name, then kept; without a name of its own, the texts as they are.
 */
export function branded(messages: Messages, locale: string, brand: string | null): Messages {
  if (!brand || brand === NAME) return messages;
  const key = `${locale}|${brand}`;
  let texts = made.get(key);
  if (!texts) {
    texts = renamed(messages, brand) as Messages;
    made.set(key, texts);
  }
  return texts;
}

function renamed(value: unknown, brand: string): unknown {
  if (typeof value === "string") return value.split(NAME).join(brand);
  if (Array.isArray(value)) return value.map((item) => renamed(item, brand));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, renamed(item, brand)]));
  }
  return value;
}
