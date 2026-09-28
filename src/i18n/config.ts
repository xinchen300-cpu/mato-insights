export const locales = ["en", "nl", "fr"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";
export const LOCALE_COOKIE = "vendly-locale";

// Belgian conventions for money, numbers and dates in every language.
export const intlLocale: Record<Locale, string> = {
  // Not en-BE: its plain numbers group with "." while its euros use ",".
  en: "en-GB",
  nl: "nl-BE",
  fr: "fr-BE",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}
