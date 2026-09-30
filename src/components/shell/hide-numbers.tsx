"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

export const HIDE_NUMBERS_KEY = "vendly:hide-numbers";

/**
 * Blurs every figure in the app so you can show MATO Insights to someone without
 * showing what it earns. Kept in this browser only: it is about who is looking
 * over your shoulder, not about who may see the data.
 */
export function HideNumbers() {
  const { m } = useI18n();
  const [hidden, setHidden] = useState(false);

  // The inline script in the layout already set the attribute before paint;
  // this only catches the state up with it.
  useEffect(() => {
    setHidden(document.documentElement.hasAttribute("data-hide-numbers"));
  }, []);

  function toggle() {
    const next = !hidden;
    setHidden(next);
    document.documentElement.toggleAttribute("data-hide-numbers", next);
    try {
      localStorage.setItem(HIDE_NUMBERS_KEY, next ? "1" : "0");
    } catch {
      // A private window without storage still switches, just not next time.
    }
  }

  const label = hidden ? m.nav.showNumbers : m.nav.hideNumbers;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={hidden}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-9 place-items-center rounded-full transition-colors hover:bg-card hover:text-foreground",
        hidden ? "bg-card text-accent-foreground" : "text-muted-foreground",
      )}
    >
      {hidden ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
    </button>
  );
}
