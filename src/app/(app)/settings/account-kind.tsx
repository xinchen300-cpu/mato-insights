"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { saveRentsToBusinesses } from "./actions";

/**
 * Zaak or automatenshop, saved as soon as it is picked. A zaak runs its own
 * machines and never sees anything about businesses; an automatenshop rents
 * machines or slots to them, and says per machine which business it is for.
 */
export function AccountKind({ rents }: { rents: boolean }) {
  const { m } = useI18n();
  const t = m.settings;
  const router = useRouter();
  const [value, setValue] = useState(rents);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [busy, startTransition] = useTransition();

  function choose(next: boolean) {
    if (next === value || busy) return;
    setValue(next);
    setStatus("idle");
    startTransition(async () => {
      try {
        await saveRentsToBusinesses(next);
        setStatus("saved");
        router.refresh();
      } catch {
        setValue(!next);
        setStatus("error");
      }
    });
  }

  return (
    <div className="grid gap-2.5">
      <div role="radiogroup" aria-label={t.kindTitle} className="grid gap-2.5 sm:grid-cols-2">
        {[false, true].map((option) => (
          <button
            key={String(option)}
            type="button"
            role="radio"
            aria-checked={value === option}
            onClick={() => choose(option)}
            className={cn(
              "flex flex-col gap-1 rounded-xl border p-4 text-left transition-[background-color,border-color] duration-150 focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:outline-none",
              value === option ? "border-foreground/80 bg-card shadow-[var(--shadow-card)]" : "border-input bg-card/60 hover:bg-card",
            )}
          >
            <span className="flex items-center gap-2.5 text-[15px] font-semibold">
              <span
                className={cn(
                  "grid size-4 shrink-0 place-items-center rounded-full border-2",
                  value === option ? "border-foreground" : "border-input",
                )}
                aria-hidden="true"
              >
                {value === option && <span className="size-2 rounded-full bg-foreground" />}
              </span>
              {option ? t.kindShop : t.kindZaak}
            </span>
            <span className="pl-[26px] text-[13px] leading-snug text-muted-foreground">
              {option ? t.kindShopHint : t.kindZaakHint}
            </span>
          </button>
        ))}
      </div>
      {busy && <span className="text-sm text-muted-foreground">{m.common.saving}</span>}
      {!busy && status === "saved" && <span className="text-sm font-medium text-positive">{m.common.saved}</span>}
      {status === "error" && <span className="text-sm font-medium text-negative">{m.common.error}</span>}
    </div>
  );
}
