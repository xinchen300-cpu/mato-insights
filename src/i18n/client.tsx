"use client";

import { createContext, useContext, useMemo } from "react";
import type { Locale } from "./config";
import { makeFormatters } from "./format";
import type { Messages } from "./messages/en";

const I18nContext = createContext<{ locale: Locale; m: Messages } | null>(null);

/**
 * The texts of the reader's own language, as the server put them together (with
 * an organisation's own name for the app, see brand.ts). Only that language
 * reaches the phone: the other two were some 140 KB of script on every page
 * (22-10-2026). The root layout hands them over once; moving between pages
 * keeps them.
 */
export function I18nProvider({ locale, messages, children }: { locale: Locale; messages: Messages; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, m: messages }), [locale, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  const f = useMemo(() => makeFormatters(context.locale), [context.locale]);
  return { locale: context.locale, m: context.m, f };
}
