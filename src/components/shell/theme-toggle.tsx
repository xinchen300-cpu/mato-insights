"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { useI18n } from "@/i18n/client";

/** The person's own choice, "light" or "dark"; none follows the phone (the layout's script reads it before paint). */
export const THEME_KEY = "mato:theme";
const THEME_COLOR = { light: "#f6f6f7", dark: "#0f0f11" };

// The class on <html> is the truth: the layout's script sets it before paint and when the phone switches.
function subscribe(changed: () => void) {
  const watch = new MutationObserver(changed);
  watch.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => watch.disconnect();
}
const isDark = () => document.documentElement.classList.contains("dark");

/**
 * Light or dark (Xin, 21-10-2026: "een dark version theme"). Until someone taps it, the app follows the
 * phone's own setting; a tap picks one and keeps it in this browser.
 */
export function ThemeToggle({ variant = "icon" }: { variant?: "icon" | "row" }) {
  const { m } = useI18n();
  const dark = useSyncExternalStore(subscribe, isDark, () => false);

  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
      meta.setAttribute("content", next ? THEME_COLOR.dark : THEME_COLOR.light);
    }
    try {
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {
      // A private window without storage still switches, just not next time.
    }
  }

  const label = dark ? m.nav.lightTheme : m.nav.darkTheme;
  const Icon = dark ? Sun : Moon;

  if (variant === "row") {
    return (
      <button
        type="button"
        onClick={toggle}
        className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-[14.5px] font-medium text-muted-foreground transition-colors duration-150 hover:bg-surface/70 hover:text-foreground"
      >
        <Icon className="size-[18px] shrink-0" strokeWidth={1.9} aria-hidden="true" />
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
    >
      <Icon className="size-[18px]" />
    </button>
  );
}
