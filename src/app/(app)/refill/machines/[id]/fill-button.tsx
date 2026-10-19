"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { cheapestWith } from "@/lib/plans";
import { createRefillSheet } from "../../actions";

/** "Vul deze automaat": a round for this one machine, straight into filling it. */
export function FillButton({ machineId }: { machineId: string }) {
  const { m } = useI18n();
  const [note, setNote] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <Button
        size="lg"
        disabled={busy}
        onClick={() => {
          setNote(null);
          startTransition(async () => {
            try {
              const result = await createRefillSheet([machineId], { fill: true });
              if (result && "empty" in result) setNote(m.refill.nothingToRefill);
              if (result && "locked" in result) setNote(fmt(m.billing.locked, { plan: m.plans[cheapestWith("refill").id] }));
            } catch (error) {
              // The round opens by redirecting, which arrives here as an error too: let that one through.
              unstable_rethrow(error);
              setNote(m.common.error);
            }
          });
        }}
      >
        {busy ? m.refill.making : m.refill.fillThis}
      </Button>
      {note && (
        <p role="status" className="text-sm text-muted-foreground">
          {note}
        </p>
      )}
    </div>
  );
}
