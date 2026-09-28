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
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setSaved(false);
    startTransition(async () => {
      await saveRunCost(Number(formData.get("perHour")), Number(formData.get("perKm")));
      setSaved(true);
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
      {saved && <span className="text-sm text-positive">{m.settings.costSaved}</span>}
    </form>
  );
}
