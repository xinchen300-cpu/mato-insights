"use client";

import { createContext, useContext, useMemo } from "react";
import type { Locale } from "./config";
import { makeFormatters } from "./format";
import { messages } from "./messages";

const LocaleContext = createContext<Locale | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useI18n() {
  const locale = useContext(LocaleContext);
  if (!locale) throw new Error("useI18n must be used inside I18nProvider");
  const f = useMemo(() => makeFormatters(locale), [locale]);
  return { locale, m: messages[locale], f };
}
