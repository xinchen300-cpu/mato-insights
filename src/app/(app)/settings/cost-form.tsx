"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/client";
import { saveRunCost } from "./actions";

/** The two numbers that turn a measured run into an amount. */
export function CostForm({ perHour, perKm }: { perHour: number; perKm: number }) {
  const { m } = useI18n();
  const [status, setStatus] = useState<"idle" | "saved" | "bad">("idle");
  const [isPending, startTransition] = useTransition();

  /** Here a euro is written with a comma, so read it that way. */
  function amount(value: FormDataEntryValue | null) {
    return Number(String(value ?? "").trim().replace(",", "."));
  }

  function submit(formData: FormData) {
    setStatus("idle");
    startTransition(async () => {
      const ok = await saveRunCost(amount(formData.get("perHour")), amount(formData.get("perKm")));
      setStatus(ok ? "saved" : "bad");
    });
  }

  return (
    <form action={submit} className="flex flex-wrap items-end gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="perHour" className="text-xs text-muted-foreground">
          {m.settings.costHour}
        </Label>
        <Input id="perHour" name="perHour" defaultValue={perHour} inputMode="decimal" className="w-28" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="perKm" className="text-xs text-muted-foreground">
          {m.settings.costKm}
        </Label>
        <Input id="perKm" name="perKm" defaultValue={perKm} inputMode="decimal" className="w-28" />
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? m.common.saving : m.common.save}
      </Button>
      {status === "saved" && <span className="text-sm text-positive">{m.settings.costSaved}</span>}
      {status === "bad" && <span className="text-sm text-negative">{m.settings.costBad}</span>}
    </form>
  );
}
