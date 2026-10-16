"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Lightbulb } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

// Seen once on this phone, then the tips fold away behind a small link.
const SEEN_KEY = "mato-insights:refill-tips-seen";

/**
 * What to keep in mind at a machine, as a tip and not as boxes to tick (Xin,
 * 14-10-2026: refilling must be smooth, no list to click through at every
 * stop). Open the very first time on a phone, folded away after that.
 */
export function RefillTips({ tips, className }: { tips: string[]; className?: string }) {
  const { m } = useI18n();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN_KEY)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one read of localStorage after mount
        setOpen(true);
        localStorage.setItem(SEEN_KEY, "1");
      }
    } catch {
      // Private mode: the tips simply start folded.
    }
  }, []);

  if (tips.length === 0) return null;
  return (
    <div className={cn("rounded-2xl bg-primary/[0.07]", className)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center gap-2 px-4 text-left text-[14px] font-semibold text-[#8a6117]"
      >
        <Lightbulb className="size-4 shrink-0" aria-hidden="true" />
        <span className="flex-1">{m.refill.tipsTitle}</span>
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && (
        <ul className="flex flex-col gap-1.5 px-4 pb-3.5 text-[14.5px] leading-snug">
          {tips.map((tip) => (
            <li key={tip} className="flex gap-2.5">
              <span className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-[#8a6117]/50" aria-hidden="true" />
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
