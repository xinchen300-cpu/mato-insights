import { cache } from "react";
import { cookies } from "next/headers";
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "./config";
import { makeFormatters } from "./format";
import { messages } from "./messages";

export const getLocale = cache(async (): Promise<Locale> => {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : defaultLocale;
});

export const getI18n = cache(async () => {
  const locale = await getLocale();
  return { locale, m: messages[locale], f: makeFormatters(locale) };
});
