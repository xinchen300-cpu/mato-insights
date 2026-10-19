export const locales = ["en", "nl", "fr"] as const;
export type Locale = (typeof locales)[number];

/** Without a choice and without a browser preference Vendly knows: most of its users read Dutch. */
export const defaultLocale: Locale = "nl";
export const LOCALE_COOKIE = "vendly-locale";

// Belgian conventions for money, numbers and dates in every language.
export const intlLocale: Record<Locale, string> = {
  // Not en-BE: its plain numbers group with "." while its euros use ",".
  en: "en-GB",
  nl: "nl-BE",
  fr: "fr-BE",
};

/** What a filler reads: Dutch or French, never English (Xin, 19-10-2026). */
export const fillerLocales = ["nl", "fr"] as const satisfies readonly Locale[];

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}
