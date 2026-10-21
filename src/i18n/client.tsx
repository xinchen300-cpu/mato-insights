"use client";

import { createContext, useContext, useMemo } from "react";
import type { Locale } from "./config";
import { makeFormatters } from "./format";
import { branded } from "./brand";
import { messages } from "./messages";

const LocaleContext = createContext<Locale | null>(null);
/** The organisation's own name for the app, if it has one (see brand.ts). */
const BrandContext = createContext<string | null>(null);

export function I18nProvider({ locale, brand = null, children }: { locale: Locale; brand?: string | null; children: React.ReactNode }) {
  return (
    <LocaleContext.Provider value={locale}>
      <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>
    </LocaleContext.Provider>
  );
}

export function useI18n() {
  const locale = useContext(LocaleContext);
  const brand = useContext(BrandContext);
  if (!locale) throw new Error("useI18n must be used inside I18nProvider");
  const f = useMemo(() => makeFormatters(locale), [locale]);
  return { locale, m: branded(messages[locale], locale, brand), f };
}
