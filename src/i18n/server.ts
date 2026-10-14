import { cache } from "react";
import { cookies, headers } from "next/headers";
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "./config";
import { makeFormatters } from "./format";
import { messages } from "./messages";

export const getLocale = cache(async (): Promise<Locale> => {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(value)) return value;
  // Nothing chosen yet, as on a first visit or an invitation opened on a
  // phone: the browser's own preference, else the default.
  const accept = (await headers()).get("accept-language") ?? "";
  for (const part of accept.split(",")) {
    const tag = part.split(";")[0].trim().slice(0, 2).toLowerCase();
    if (isLocale(tag)) return tag;
  }
  return defaultLocale;
});

export const getI18n = cache(async () => {
  const locale = await getLocale();
  return { locale, m: messages[locale], f: makeFormatters(locale) };
});
