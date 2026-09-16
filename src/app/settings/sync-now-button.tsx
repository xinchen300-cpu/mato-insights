"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { triggerSync } from "./actions";

export function SyncNowButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleClick() {
    setMessage(null);
    startTransition(async () => {
      const result = await triggerSync();
      if (result.status === "success") {
        setMessage(`Synced ${result.transactionsSynced} transactions.`);
      } else {
        setMessage(`Sync failed: ${result.error}`);
      }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3">
      <Button onClick={handleClick} disabled={isPending} variant="outline" size="sm">
        {isPending ? "Syncing..." : "Sync now"}
      </Button>
      {message && <span className="text-sm text-muted-foreground">{message}</span>}
    </div>
  );
}
