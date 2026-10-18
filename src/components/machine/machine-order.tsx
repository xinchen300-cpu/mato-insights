"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownUp, ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { MachinePhoto } from "@/components/machine/machine-photo";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { saveMachineOrder } from "@/app/(app)/refill/actions";

export type OrderMachine = { id: string; name: string; photoPath: string | null };

/**
 * The machines in the order of the route, put in another order by sliding them
 * (Xin, 17-10-2026): one button turns the tiles into a list, a machine held by
 * its grip follows the finger, the arrows do the same a step at a time, and
 * "save" makes it the order everywhere. Until then the tiles stay as they are.
 */
export function MachineOrder({ machines, children }: { machines: OrderMachine[]; children: React.ReactNode }) {
  const { m } = useI18n();
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [order, setOrder] = useState(() => machines.map((machine) => machine.id));
  const [drag, setDrag] = useState<{ id: string; startY: number; dy: number } | null>(null);
  const [result, setResult] = useState<"saved" | "error" | null>(null);
  const firstRow = useRef<HTMLLIElement>(null);
  const byId = new Map(machines.map((machine) => [machine.id, machine]));
  const changed = order.some((id, i) => id !== machines[i]?.id);

  function move(id: string, by: number) {
    setOrder((current) => {
      const from = current.indexOf(id);
      const to = Math.max(0, Math.min(current.length - 1, from + by));
      if (from < 0 || to === from) return current;
      const next = [...current];
      next.splice(to, 0, ...next.splice(from, 1));
      return next;
    });
  }

  // The held machine follows the finger and swaps places each time it passes a whole row.
  function onPointerMove(event: React.PointerEvent) {
    if (!drag) return;
    const step = (firstRow.current?.getBoundingClientRect().height ?? 64) + 8;
    const dy = event.clientY - drag.startY;
    const index = order.indexOf(drag.id);
    const steps = Math.max(-index, Math.min(order.length - 1 - index, Math.round(dy / step)));
    if (steps !== 0) {
      haptic();
      move(drag.id, steps);
      setDrag({ ...drag, startY: drag.startY + steps * step, dy: dy - steps * step });
    } else {
      setDrag({ ...drag, dy });
    }
  }

  function save() {
    setResult(null);
    startTransition(async () => {
      try {
        await saveMachineOrder(order);
        setEditing(false);
        setResult("saved");
        router.refresh();
      } catch {
        setResult("error");
      }
    });
  }

  if (!editing) {
    return (
      <div className="flex flex-col gap-3">
        {machines.length > 1 && (
          <div className="flex items-center justify-between gap-3">
            {result === "saved" ? (
              <span role="status" className="px-1 text-sm font-semibold text-positive">
                {m.refill.orderSaved}
              </span>
            ) : (
              <span />
            )}
            <Button
              variant="outline"
              onClick={() => {
                setOrder(machines.map((machine) => machine.id));
                setResult(null);
                setEditing(true);
              }}
            >
              <ArrowDownUp />
              {m.refill.reorder}
            </Button>
          </div>
        )}
        {children}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="px-1 text-sm text-muted-foreground">{m.refill.reorderHint}</p>
      <ol className="flex flex-col gap-2" onPointerMove={onPointerMove} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}>
        {order.map((id, index) => {
          const machine = byId.get(id)!;
          const held = drag?.id === id;
          return (
            <li
              key={id}
              ref={index === 0 ? firstRow : undefined}
              style={held ? { transform: `translateY(${drag.dy}px)` } : undefined}
              className={cn(
                "surface-card relative flex h-16 items-center gap-3 overflow-hidden pr-2",
                held ? "z-10 shadow-[var(--shadow-pop)] ring-2 ring-foreground" : "transition-transform duration-150",
              )}
            >
              {/* The grip: hold it and slide; it takes the touch, so the page does not scroll meanwhile. */}
              <span
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  haptic();
                  setDrag({ id, startY: event.clientY, dy: 0 });
                }}
                className="grid h-full w-12 shrink-0 cursor-grab touch-none place-items-center bg-surface text-muted-foreground active:cursor-grabbing"
                aria-hidden="true"
              >
                <GripVertical className="size-5" />
              </span>
              <span className="tabular w-5 shrink-0 text-center text-[15px] font-bold">{index + 1}</span>
              {/* On a phone the name gets the room: it is what tells two machines apart. */}
              <MachinePhoto path={machine.photoPath} className="hidden size-11 shrink-0 rounded-lg sm:block" />
              <span className="line-clamp-2 min-w-0 flex-1 text-[15px] font-semibold leading-tight">{machine.name}</span>
              <span className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => move(id, -1)}
                  disabled={busy || index === 0}
                  aria-label={fmt(m.refill.moveUp, { machine: machine.name })}
                  className="grid size-11 place-items-center rounded-full bg-surface text-foreground active:scale-95 disabled:opacity-30"
                >
                  <ChevronUp className="size-5" />
                </button>
                <button
                  type="button"
                  onClick={() => move(id, 1)}
                  disabled={busy || index === order.length - 1}
                  aria-label={fmt(m.refill.moveDown, { machine: machine.name })}
                  className="grid size-11 place-items-center rounded-full bg-surface text-foreground active:scale-95 disabled:opacity-30"
                >
                  <ChevronDown className="size-5" />
                </button>
              </span>
            </li>
          );
        })}
      </ol>

      {/* Clears the tab bar on phones, the iPhone's home bar included. */}
      <div className="surface-card sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 mt-2 flex flex-col gap-2 bg-card/95 p-3 backdrop-blur-xl lg:bottom-4">
        {result === "error" && (
          <span role="alert" className="px-1 text-sm text-negative">
            {m.common.error}
          </span>
        )}
        <div className="flex gap-2">
          <Button size="lg" onClick={save} disabled={busy || !changed} className="flex-1 sm:flex-none">
            {busy ? m.common.saving : m.common.save}
          </Button>
          <Button size="lg" variant="outline" onClick={() => setEditing(false)} disabled={busy}>
            {m.common.cancel}
          </Button>
        </div>
      </div>
    </div>
  );
}
