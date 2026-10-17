"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, SlidersHorizontal } from "lucide-react";
import { FrontView, StockLegend, type FrontSlot } from "@/components/machine/front-view";
import { Section } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { haptic } from "@/lib/haptics";
import { toFrontRows } from "@/lib/layout";
import type { SlotStock } from "@/lib/types";
import { cn } from "@/lib/utils";
import { correctStock } from "../../actions";

/**
 * The machine's slots as a picture for whoever fills it, with the counts set
 * right on it (Xin, 17-10-2026): one button switches it on, then every slot
 * has a big minus and plus under its product, so a count is one tap away.
 * Nothing is sent before "save", as one correction.
 */
export function StockAdjust({ machineId, slots }: { machineId: string; slots: SlotStock[] }) {
  const { m } = useI18n();
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [result, setResult] = useState<"saved" | "error" | null>(null);

  const bySlot = new Map(slots.map((slot) => [slot.slot_id, slot]));
  // A slot nobody counted yet changes as soon as it is given a number, even 0.
  const changed = slots.filter((slot) => slot.selection_number in levels && levels[slot.selection_number] !== slot.stock);
  const rows = toFrontRows(slots.map((s) => (s.selection_number in levels ? { ...s, stock: levels[s.selection_number] } : s)));

  function step(slot: SlotStock, by: number) {
    haptic();
    setResult(null);
    setLevels((current) => {
      const now = current[slot.selection_number] ?? slot.stock ?? 0;
      return { ...current, [slot.selection_number]: Math.max(0, Math.min(slot.capacity, now + by)) };
    });
  }

  function stop() {
    setEditing(false);
    setLevels({});
  }

  function save() {
    setResult(null);
    startTransition(async () => {
      try {
        await correctStock(
          machineId,
          changed.map((s) => ({ selection: s.selection_number, level: levels[s.selection_number] })),
        );
        haptic("success");
        stop();
        setResult("saved");
        router.refresh();
      } catch {
        setResult("error");
      }
    });
  }

  // Under each product while adjusting: its count, big, and a minus and a plus a thumb cannot miss.
  const footer = (front: FrontSlot) => {
    const slot = bySlot.get(front.key);
    if (!slot) return null;
    const known = slot.selection_number in levels || slot.stock !== null;
    const value = levels[slot.selection_number] ?? slot.stock ?? 0;
    const moved = changed.includes(slot);
    return (
      <div className="flex flex-col gap-1 px-1 pb-1">
        <div className="tabular flex items-baseline justify-center gap-1">
          {moved && <span className="text-[12px] text-muted-foreground">{slot.stock ?? "?"} →</span>}
          <span className={cn("text-[22px] font-bold leading-none tracking-[-0.02em]", moved && "text-chart-2")}>
            {known ? value : "?"}
          </span>
          <span className="text-[12px] text-muted-foreground">/{slot.capacity}</span>
        </div>
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => step(slot, -1)}
            disabled={busy || (known && value <= 0)}
            aria-label={`− ${slot.selection_number}`}
            className="grid h-11 place-items-center rounded-md bg-surface text-foreground transition-transform active:scale-95 disabled:opacity-30"
          >
            <Minus className="size-5" strokeWidth={2.75} />
          </button>
          <button
            type="button"
            onClick={() => step(slot, 1)}
            disabled={busy || value >= slot.capacity}
            aria-label={`+ ${slot.selection_number}`}
            className="grid h-11 place-items-center rounded-md bg-foreground text-background transition-transform active:scale-95 disabled:opacity-30"
          >
            <Plus className="size-5" strokeWidth={2.75} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <Section title={m.refill.stockTitle} hint={editing ? m.refill.countsEditingHint : m.refill.countsHint}>
      {!editing && (
        <Button
          size="lg"
          variant="outline"
          onClick={() => {
            setResult(null);
            setEditing(true);
          }}
          className="w-full sm:w-auto sm:self-start"
        >
          <SlidersHorizontal />
          {m.refill.adjustCounts}
        </Button>
      )}
      <FrontView rows={rows} roomy={editing} renderSlotFooter={editing ? footer : undefined} />
      <StockLegend
        labels={{
          full: m.machines.legendFull,
          half: m.machines.legendHalf,
          low: m.machines.legendLow,
          empty: m.machines.legendEmpty,
          unknown: m.machines.legendUnknown,
        }}
      />
      {result === "saved" && <p className="px-1 text-sm font-semibold text-positive">{m.stock.correctionSaved}</p>}

      {editing && (
        // Clears the tab bar on phones, the iPhone's home bar included.
        <div className="surface-card sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 mt-2 flex flex-col gap-2 bg-card/95 p-3 backdrop-blur-xl lg:bottom-4">
          <div className="flex gap-2">
            <Button size="lg" onClick={save} disabled={busy || changed.length === 0} className="flex-1 sm:flex-none">
              {busy ? m.common.saving : m.stock.saveCorrection}
            </Button>
            <Button size="lg" variant="outline" onClick={stop} disabled={busy}>
              {m.common.cancel}
            </Button>
          </div>
          {result === "error" && <span className="px-1 text-sm text-negative">{m.common.error}</span>}
        </div>
      )}
    </Section>
  );
}
