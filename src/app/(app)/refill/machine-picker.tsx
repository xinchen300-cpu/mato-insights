"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { cheapestWith } from "@/lib/plans";
import { createRefillSheet } from "./actions";

export function MachinePicker({
  machines,
}: {
  machines: { id: string; name: string; hint: string; low: boolean; note?: string }[];
}) {
  const { m } = useI18n();
  const [selected, setSelected] = useState<Set<string>>(new Set(machines.filter((mc) => mc.low).map((mc) => mc.id)));
  const [empty, setEmpty] = useState(false);
  const [locked, setLocked] = useState(false);
  const [isPending, startTransition] = useTransition();

  function toggle(id: string) {
    setEmpty(false);
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function make() {
    setEmpty(false);
    startTransition(async () => {
      const result = await createRefillSheet([...selected]);
      if (result && "empty" in result) setEmpty(true);
      if (result && "locked" in result) setLocked(true);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="eyebrow">{m.refill.selectMachines}</p>
        <button
          type="button"
          onClick={() => setSelected(new Set(machines.map((mc) => mc.id)))}
          className="text-sm font-semibold text-accent-foreground hover:underline"
        >
          {m.refill.selectAll}
        </button>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {machines.map((mc) => {
          const checked = selected.has(mc.id);
          return (
            <li key={mc.id}>
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-3 border bg-card p-4 transition-colors",
                  checked ? "border-primary bg-accent" : "hover:border-primary/50",
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(mc.id)}
                  className="size-5 accent-[var(--primary)]"
                />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{mc.name}</span>
                  <span className={cn("figure block text-sm", mc.low ? "text-negative" : "text-muted-foreground")}>
                    {mc.hint}
                  </span>
                  {mc.note && <span className="figure block text-xs text-accent-foreground">{mc.note}</span>}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {empty && <p className="text-sm text-muted-foreground">{m.refill.nothingToRefill}</p>}
      <Button size="lg" onClick={make} disabled={isPending || selected.size === 0} className="w-fit">
        <ClipboardList />
        {isPending ? m.refill.making : m.refill.make}
      </Button>
      {locked && (
        <p role="status" className="text-sm">
          {fmt(m.billing.locked, { plan: m.plans[cheapestWith("refill").id] })}{" "}
          <Link href="/settings#abonnement" className="font-semibold underline underline-offset-4">
            {m.billing.lockedLink}
          </Link>
        </p>
      )}
    </div>
  );
}
