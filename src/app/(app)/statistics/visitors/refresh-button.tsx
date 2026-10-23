"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { refreshVisitorsNow } from "./actions";

/** Reads UniFi now instead of waiting for the next visit; the first time it takes a while (30 days). */
export function RefreshVisitors() {
  const { m } = useI18n();
  const [pending, start] = useTransition();
  const [state, setState] = useState<"idle" | "done" | "error">("idle");

  return (
    <Button
      variant="secondary"
      disabled={pending}
      onClick={() =>
        start(async () => {
          setState("idle");
          try {
            await refreshVisitorsNow();
            setState("done");
          } catch {
            setState("error");
          }
        })
      }
    >
      <RefreshCw className={pending ? "animate-spin" : undefined} />
      {pending ? m.visitors.refreshing : state === "done" ? m.visitors.refreshed : state === "error" ? m.common.error : m.visitors.refresh}
    </Button>
  );
}
