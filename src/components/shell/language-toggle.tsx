"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { setLocale } from "@/i18n/actions";
import { useI18n } from "@/i18n/client";
import { locales, type Locale } from "@/i18n/config";

/** The language buttons; `only` narrows them, as for a filler (Dutch and French). */
export function LanguageToggle({ only = locales }: { only?: readonly Locale[] }) {
  const { locale, m } = useI18n();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div
      role="group"
      aria-label={m.nav.language}
      className={cn("flex rounded-full border bg-card p-0.5", isPending && "opacity-60")}
    >
      {only.map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={l === locale}
          onClick={() =>
            startTransition(async () => {
              await setLocale(l);
              router.refresh();
            })
          }
          className={cn(
            "rounded-full px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground transition-colors",
            l === locale ? "bg-foreground text-background" : "hover:text-foreground",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
