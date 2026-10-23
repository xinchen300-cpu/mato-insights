"use server";

import { cookies } from "next/headers";
import { rememberNotificationLocale } from "@/lib/data";
import { isLocale, LOCALE_COOKIE } from "./config";

export async function setLocale(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  // Messages (Instellingen → Meldingen) come in the language one reads the app in.
  await rememberNotificationLocale(locale).catch(() => undefined);
}
