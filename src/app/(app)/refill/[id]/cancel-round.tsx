"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { cancelRound } from "../actions";

/** Cancelling an open round, after one more question; once a machine is done it says why it cannot. */
export function CancelRound({ sheetId }: { sheetId: string }) {
  const { m } = useI18n();
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function cancel() {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await cancelRound(sheetId);
        if (result === "started") {
          setAsking(false);
          setMessage(m.refill.cancelStarted);
          return;
        }
        router.push("/refill");
      } catch {
        setMessage(m.common.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {asking ? (
        <>
          <p className="text-[14.5px]">{m.refill.cancelConfirm}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="destructive" disabled={pending} onClick={cancel}>
              {m.refill.cancelYes}
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => setAsking(false)}>
              {m.refill.cancelNo}
            </Button>
          </div>
        </>
      ) : (
        <Button variant="outline" className="self-start" onClick={() => setAsking(true)}>
          {m.refill.cancelRound}
        </Button>
      )}
      {message && <p className="text-[14px] text-muted-foreground">{message}</p>}
    </div>
  );
}
