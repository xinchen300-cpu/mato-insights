"use client";

import { useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EyeOff, Languages, SunMoon } from "lucide-react";
import { setHideNumbers, useHiddenNumbers } from "@/components/shell/hide-numbers";
import { readThemeChoice, setThemeChoice, THEME_EVENT, type ThemeChoice } from "@/components/shell/theme-toggle";
import { setLocale } from "@/i18n/actions";
import { useI18n } from "@/i18n/client";
import { intlLocale, type Locale } from "@/i18n/config";
import { PrefRow, Segmented, Switch } from "./preference-controls";

// A choice is made here or with the bar's button (both announce it), or in another tab (storage).
function watchTheme(changed: () => void) {
  addEventListener(THEME_EVENT, changed);
  addEventListener("storage", changed);
  return () => {
    removeEventListener(THEME_EVENT, changed);
    removeEventListener("storage", changed);
  };
}

/** Dutch and French first: the languages of the people who use it most. */
const LANGUAGES: Locale[] = ["nl", "fr", "en"];

/**
 * Weergave (23-10-2026, Xin: "change language, change theme"): the language, light, dark or following the phone, and
 * the figures hidden for when someone looks along. The first is the account's (a cookie the server reads); the other
 * two are this browser's, as the buttons in the bar keep them.
 */
export function Appearance() {
  const { m, locale } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // What this browser keeps; the server cannot know it, so nothing is marked until the page runs here.
  const theme = useSyncExternalStore<ThemeChoice | null>(watchTheme, readThemeChoice, () => null);
  const hidden = useHiddenNumbers();

  // Each language in its own words, so whoever cannot read the current one still finds theirs.
  const languageName = (l: Locale) => {
    const name = new Intl.DisplayNames([intlLocale[l]], { type: "language" }).of(l) ?? l;
    return name.charAt(0).toLocaleUpperCase(intlLocale[l]) + name.slice(1);
  };

  return (
    <div className="surface-card flex flex-col p-2">
      <PrefRow
        icon={<Languages />}
        title={m.prefs.language}
        control={
          <Segmented
            label={m.prefs.language}
            value={locale}
            disabled={pending}
            options={LANGUAGES.map((l) => ({ value: l, label: languageName(l) }))}
            onChange={(next) =>
              startTransition(async () => {
                await setLocale(next);
                router.refresh();
              })
            }
          />
        }
      />
      <PrefRow
        icon={<SunMoon />}
        title={m.prefs.theme}
        hint={m.prefs.themeHint}
        control={
          <Segmented
            label={m.prefs.theme}
            value={theme}
            options={[
              { value: "light", label: m.prefs.themeLight },
              { value: "dark", label: m.prefs.themeDark },
              { value: "system", label: m.prefs.themeSystem },
            ]}
            onChange={setThemeChoice}
          />
        }
      />
      <PrefRow
        inline
        icon={<EyeOff />}
        title={m.prefs.hideFigures}
        hint={m.prefs.hideFiguresHint}
        control={<Switch on={hidden} onChange={setHideNumbers} label={m.prefs.hideFigures} />}
      />
    </div>
  );
}
