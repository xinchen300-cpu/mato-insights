"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { syncNow } from "./actions";

export function SyncNowButton() {
  const { m } = useI18n();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleClick() {
    setMessage(null);
    startTransition(async () => {
      const result = await syncNow();
      if (result.status === "success") {
        setMessage(
          result.transactionsSynced > 0
            ? fmt(m.settings.synced, { count: result.transactionsSynced })
            : m.settings.syncedNone,
        );
      } else {
        setMessage(fmt(m.settings.syncFailed, { error: result.error ?? "" }));
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={handleClick} disabled={isPending} variant="outline">
        <RefreshCw className={isPending ? "animate-spin" : undefined} />
        {isPending ? m.settings.syncing : m.settings.syncNow}
      </Button>
      {message && <span className="text-sm text-muted-foreground">{message}</span>}
    </div>
  );
}
