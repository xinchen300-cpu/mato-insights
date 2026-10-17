"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronUp, ClipboardList } from "lucide-react";
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
  canOrder = false,
}: {
  /** In the order of the route. */
  machines: { id: string; name: string; hint: string; low: boolean; note?: string }[];
  /** The owner puts the round in order (and so sets the route); a filler follows it. */
  canOrder?: boolean;
}) {
  const { m } = useI18n();
  const [selected, setSelected] = useState<Set<string>>(new Set(machines.filter((mc) => mc.low).map((mc) => mc.id)));
  // Every machine in route order; the round is the ticked ones, in this order.
  const [order, setOrder] = useState<string[]>(() => machines.map((mc) => mc.id));
  const chosen = order.filter((id) => selected.has(id));
  const nameOf = new Map(machines.map((mc) => [mc.id, mc.name]));

  /** One place earlier or later among the ticked machines. */
  function move(id: string, by: -1 | 1) {
    setOrder((current) => {
      const picked = current.filter((x) => selected.has(x));
      const from = picked.indexOf(id);
      const other = picked[from + by];
      if (from < 0 || !other) return current;
      const next = [...current];
      const a = next.indexOf(id);
      const b = next.indexOf(other);
      [next[a], next[b]] = [next[b], next[a]];
      return next;
    });
  }
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
      const result = await createRefillSheet(chosen);
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
                    "grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-bold transition-colors duration-150",
                    checked ? "bg-foreground text-background" : "shadow-[inset_0_0_0_1.5px_var(--input)]",
                  )}
                  aria-hidden="true"
                >
                  {/* For the owner, a ticked machine shows its place in the route. */}
                  {checked && (canOrder ? chosen.indexOf(mc.id) + 1 : <Check className="size-4" strokeWidth={3} />)}
                </span>
              </label>
            </li>
          );
        })}
      </RowList>
      {canOrder && chosen.length >= 2 && (
        <div className="surface-card mt-2 flex flex-col gap-1 p-2">
          <div className="px-3 pb-1 pt-2">
            <p className="text-[15px] font-semibold">{m.refill.routeOrder}</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">{m.refill.routeOrderHint}</p>
          </div>
          <ol className="flex flex-col">
            {chosen.map((id, index) => (
              <li key={id} className="flex min-h-14 items-center gap-3 rounded-xl px-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-foreground text-[13px] font-bold text-background">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{nameOf.get(id)}</span>
                <button
                  type="button"
                  onClick={() => move(id, -1)}
                  disabled={index === 0}
                  aria-label={`${m.refill.moveEarlier}: ${nameOf.get(id)}`}
                  className="grid size-10 place-items-center rounded-full bg-surface transition-transform active:scale-95 disabled:opacity-30"
                >
                  <ChevronUp className="size-5" />
                </button>
                <button
                  type="button"
                  onClick={() => move(id, 1)}
                  disabled={index === chosen.length - 1}
                  aria-label={`${m.refill.moveLater}: ${nameOf.get(id)}`}
                  className="grid size-10 place-items-center rounded-full bg-surface transition-transform active:scale-95 disabled:opacity-30"
                >
                  <ChevronDown className="size-5" />
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
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
