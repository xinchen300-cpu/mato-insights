"use client";

import { useSyncExternalStore } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

export const HIDE_NUMBERS_KEY = "vendly:hide-numbers";

// The attribute on <html> is the truth: the layout's script sets it before paint, and the settings page and the
// shell's button both follow it.
function subscribe(changed: () => void) {
  const watch = new MutationObserver(changed);
  watch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-hide-numbers"] });
  return () => watch.disconnect();
}

/** Whether the figures are hidden now. */
export function useHiddenNumbers(): boolean {
  return useSyncExternalStore(subscribe, () => document.documentElement.hasAttribute("data-hide-numbers"), () => false);
}

/** Blurs or shows every figure, and keeps that in this browser. */
export function setHideNumbers(hidden: boolean) {
  document.documentElement.toggleAttribute("data-hide-numbers", hidden);
  try {
    localStorage.setItem(HIDE_NUMBERS_KEY, hidden ? "1" : "0");
  } catch {
    // A private window without storage still switches, just not next time.
  }
}

/**
 * Blurs every figure in the app so you can show Vendly to someone without
 * showing what it earns. Kept in this browser only: it is about who is looking
 * over your shoulder, not about who may see the data.
 */
export function HideNumbers({ variant = "icon" }: { variant?: "icon" | "row" }) {
  const { m } = useI18n();
  const hidden = useHiddenNumbers();

  function toggle() {
    setHideNumbers(!hidden);
  }

  const label = hidden ? m.nav.showNumbers : m.nav.hideNumbers;

  const Icon = hidden ? EyeOff : Eye;

  if (variant === "row") {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={hidden}
        className={cn(
          "flex h-10 w-full items-center gap-3 rounded-xl px-3 text-[14.5px] font-medium transition-colors duration-150 hover:bg-surface/70 hover:text-foreground",
          hidden ? "bg-surface text-foreground" : "text-muted-foreground",
        )}
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
      aria-pressed={hidden}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-9 place-items-center rounded-full transition-colors hover:bg-surface hover:text-foreground",
        hidden ? "bg-surface text-foreground" : "text-muted-foreground",
      )}
    >
      <Icon className="size-[18px]" />
    </button>
  );
}
