"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, ClipboardList } from "lucide-react";
import { Avatar, RowList} from "@/components/list-row";
import { Section } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { cheapestWith } from "@/lib/plans";
import { createRefillSheet } from "./actions";
import { MachineIcon } from "@/components/machine/machine-icon";

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
    <Section
      title={m.refill.selectMachines}
      actions={
        <button
          type="button"
          onClick={() => setSelected(new Set(machines.map((mc) => mc.id)))}
          className={buttonVariants({ variant: "ghost" })}
        >
          {m.refill.selectAll}
        </button>
      }
    >
      {/* Each machine is one row you can tap anywhere on; the real checkbox
          stays in the row for keyboards and screen readers. */}
      <RowList>
        {machines.map((mc) => {
          const checked = selected.has(mc.id);
          return (
            <li key={mc.id}>
              <label
                className={cn(
                  "hover-surface flex min-h-[72px] cursor-pointer items-center gap-3.5 rounded-xl px-3 py-3",
                  "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/40",
                )}
              >
                <input type="checkbox" checked={checked} onChange={() => toggle(mc.id)} className="sr-only" />
                <Avatar><MachineIcon /></Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold tracking-[-0.01em]">{mc.name}</span>
                  <span
                    className={cn(
                      "figure mt-0.5 flex items-start gap-1.5 text-[13px]",
                      mc.low ? "text-negative" : "text-muted-foreground",
                    )}
                  >
                    {mc.low && <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-negative" aria-hidden="true" />}
                    <span className="min-w-0">{mc.hint}</span>
                  </span>
                  {mc.note && <span className="figure mt-0.5 block text-[13px] text-foreground/80">{mc.note}</span>}
                </span>
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-full transition-colors duration-150",
                    checked ? "bg-foreground text-background" : "shadow-[inset_0_0_0_1.5px_var(--input)]",
                  )}
                  aria-hidden="true"
                >
                  {checked && <Check className="size-4" strokeWidth={3} />}
                </span>
              </label>
            </li>
          );
        })}
      </RowList>
      {empty && <p className="px-1 text-sm text-muted-foreground">{m.refill.nothingToRefill}</p>}
      <Button
        size="lg"
        onClick={make}
        disabled={isPending || selected.size === 0}
        className="mt-2 h-14 w-full text-base sm:h-12 sm:w-fit sm:text-[0.95rem]"
      >
        <ClipboardList />
        {isPending ? m.refill.making : m.refill.make}
      </Button>
      {locked && (
        <p role="status" className="px-1 text-sm">
          {fmt(m.billing.locked, { plan: m.plans[cheapestWith("refill").id] })}{" "}
          <Link href="/settings#abonnement" className="font-semibold underline underline-offset-4">
            {m.billing.lockedLink}
          </Link>
        </p>
      )}
    </Section>
  );
}
