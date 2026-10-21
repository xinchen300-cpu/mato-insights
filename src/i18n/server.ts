import { cache } from "react";
import { cookies, headers } from "next/headers";
import { getOrgBrand, getSessionUser, isFiller } from "@/lib/org";
import { branded } from "./brand";
import { defaultLocale, fillerLocales, isLocale, LOCALE_COOKIE, type Locale } from "./config";
import { makeFormatters } from "./format";
import { messages } from "./messages";

/** The languages the browser asks for, best first, as far as there is a version of them. */
async function browserLocales(): Promise<Locale[]> {
  const accept = (await headers()).get("accept-language") ?? "";
  return accept
    .split(",")
    .map((part) => part.split(";")[0].trim().slice(0, 2).toLowerCase())
    .filter(isLocale);
}

/** A logged-in filler. Nobody logged in is no filler, and a failing look-up costs the page nothing. */
async function readsAsFiller(): Promise<boolean> {
  try {
    return (await getSessionUser()) !== null && (await isFiller());
  } catch {
    return false;
  }
}

export const getLocale = cache(async (): Promise<Locale> => {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  // Nothing chosen yet, as on a first visit or an invitation opened on a
  // phone: the browser's own preference, else the default.
  const chosen = isLocale(value) ? value : ((await browserLocales())[0] ?? defaultLocale);
  // A filler reads Dutch or French, never English (Xin, 19-10-2026): a phone
  // set to English, or EN picked at the login, gives the first of the two the
  // browser asks for, else Dutch. Only asked about English, so other pages
  // never wait on who is looking.
  if (chosen === "en" && (await readsAsFiller())) {
    return (await browserLocales()).find((locale) => (fillerLocales as readonly Locale[]).includes(locale)) ?? defaultLocale;
  }
  return chosen;
});

export const getI18n = cache(async () => {
  const [locale, brand] = await Promise.all([getLocale(), getOrgBrand()]);
  return { locale, m: branded(messages[locale], locale, brand), f: makeFormatters(locale) };
});
