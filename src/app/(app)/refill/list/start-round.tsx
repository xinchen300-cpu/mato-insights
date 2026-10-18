"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { cheapestWith } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { createRefillSheet } from "../actions";

/**
 * One tap to a round with every machine on it that needs something: from the
 * vullijst, and big at the top of the filler's home ("Begin met vullen").
 */
export function StartRound({ machineIds, label, big = false }: { machineIds: string[]; label?: string; big?: boolean }) {
  const { m } = useI18n();
  const [result, setResult] = useState<"empty" | "locked" | "failed" | null>(null);
  const [pending, startTransition] = useTransition();

  function start() {
    setResult(null);
    startTransition(async () => {
      try {
        const outcome = await createRefillSheet(machineIds);
        if (outcome && "empty" in outcome) setResult("empty");
        if (outcome && "locked" in outcome) setResult("locked");
      } catch (error) {
        // The new round opens by redirecting, which arrives here as an error too: let that one through.
        unstable_rethrow(error);
        setResult("failed");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {result && (
        <p role={result === "failed" ? "alert" : "status"} className="rounded-xl bg-card/95 px-3 py-2 text-sm shadow-sm backdrop-blur">
          {result === "empty" ? (
            m.refill.nothingToRefill
          ) : result === "failed" ? (
            <span className="text-negative">{m.common.error}</span>
          ) : (
            <>
              {fmt(m.billing.locked, { plan: m.plans[cheapestWith("refill").id] })}{" "}
              <Link href="/settings#abonnement" className="font-semibold underline underline-offset-4">
                {m.billing.lockedLink}
              </Link>
            </>
          )}
        </p>
      )}
      <button
        type="button"
        onClick={start}
        disabled={pending}
        className={cn(
          "flex w-full items-center justify-center gap-2.5 rounded-2xl bg-foreground px-4 font-semibold text-background shadow-[var(--shadow-pop)] active:scale-[0.99] disabled:opacity-60",
          big ? "h-20 text-[20px] tracking-[-0.01em]" : "h-14 text-[17px]",
        )}
      >
        <ClipboardList className={big ? "size-6" : "size-5"} aria-hidden="true" />
        {pending ? m.fillList.starting : (label ?? m.fillList.start)}
      </button>
    </div>
  );
}
