"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { cheapestWith } from "@/lib/plans";
import { createRefillSheet } from "../actions";

/** One tap from the vullijst to a round with every machine on it that needs something. */
export function StartRound({ machineIds }: { machineIds: string[] }) {
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
        className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-foreground px-4 text-[17px] font-semibold text-background shadow-[var(--shadow-pop)] active:scale-[0.99] disabled:opacity-60"
      >
        <ClipboardList className="size-5" aria-hidden="true" />
        {pending ? m.fillList.starting : m.fillList.start}
      </button>
    </div>
  );
}
