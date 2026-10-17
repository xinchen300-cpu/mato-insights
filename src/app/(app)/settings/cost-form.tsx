"use client";

import { useState, useTransition } from "react";
import { Clock, Route } from "lucide-react";
import { Avatar } from "@/components/list-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/client";
import { saveRunCost } from "./actions";

/** The two numbers that turn a measured run into an amount. `bare` drops the card, for inside another one. */
export function CostForm({ perHour, perKm, bare = false }: { perHour: number; perKm: number; bare?: boolean }) {
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

  // Two settings rows, label left and the amount right, then one save for both.
  return (
    <form action={submit} className={bare ? "flex flex-col" : "surface-card flex flex-col p-2"}>
      <div className="flex min-h-16 items-center gap-3.5 rounded-xl px-3 py-3">
        <Avatar>
          <Clock />
        </Avatar>
        <Label htmlFor="perHour" className="min-w-0 flex-1 text-[15px] font-semibold tracking-[-0.01em]">
          {m.settings.costHour}
        </Label>
        <Input id="perHour" name="perHour" defaultValue={perHour} inputMode="decimal" className="w-28 text-right" />
      </div>
      <div className="flex min-h-16 items-center gap-3.5 rounded-xl px-3 py-3">
        <Avatar>
          <Route />
        </Avatar>
        <Label htmlFor="perKm" className="min-w-0 flex-1 text-[15px] font-semibold tracking-[-0.01em]">
          {m.settings.costKm}
        </Label>
        <Input id="perKm" name="perKm" defaultValue={perKm} inputMode="decimal" className="w-28 text-right" />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 px-3 pb-2 pt-2">
        {status === "saved" && (
          <span className="mr-auto text-[13.5px] font-medium text-positive">{m.settings.costSaved}</span>
        )}
        {status === "bad" && (
          <span className="mr-auto min-w-0 flex-1 basis-56 text-[13.5px] font-medium text-negative">
            {m.settings.costBad}
          </span>
        )}
        <Button type="submit" disabled={isPending}>
          {isPending ? m.common.saving : m.common.save}
        </Button>
      </div>
    </form>
  );
}
