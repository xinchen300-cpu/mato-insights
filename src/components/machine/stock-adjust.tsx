"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, CircleCheck, Minus, PackagePlus, Plus, SlidersHorizontal } from "lucide-react";
import { FrontView, StockLegend, type FrontSlot } from "@/components/machine/front-view";
import { Section } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { plural } from "@/i18n/format";
import { haptic } from "@/lib/haptics";
import { toFrontRows } from "@/lib/layout";
import type { SlotStock } from "@/lib/types";
import { cn } from "@/lib/utils";
import { correctStock } from "@/app/(app)/refill/actions";

/** How long the big green check stays in the middle of the screen after saving; a tap closes it sooner. */
const TOAST_MS = 2000;

/**
 * The machine's slots as a picture for whoever fills it, with the counts set
 * right on it (Xin, 17-10-2026): one button switches it on, then every slot
 * has a big minus and plus under its product, so a count is one tap away.
 * Nothing is sent before "save", as one correction.
 *
 * On the machine's own page the owner adjusts right there, without being sent
 * to the refill page (Xin, 21-10-2026): `embedded` gives that page's own picture
 * of the slots while not adjusting, the button's label and the buttons beside it.
 */
export function StockAdjust({
  machineId,
  slots,
  embedded,
}: {
  machineId: string;
  slots: SlotStock[];
  embedded?: { idle: React.ReactNode; label: string; actions?: React.ReactNode };
}) {
  const { m } = useI18n();
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [result, setResult] = useState<"saved" | "error" | null>(null);
  // How many slots the last save changed, while the big green check shows (Xin, 21-10-2026: "in het midden van
  // het scherm, in het groot, een groen vinkje").
  const [toast, setToast] = useState<number | null>(null);
  useEffect(() => {
    if (toast === null) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

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

  /** Every slot with a product up to what it holds (Xin, 19-10-2026): after a full refill, one tap and "save". */
  function fillAll() {
    haptic();
    setResult(null);
    setLevels((current) => ({
      ...current,
      ...Object.fromEntries(slots.filter((slot) => slot.product_id).map((slot) => [slot.selection_number, slot.capacity])),
    }));
  }
  const allFull = slots.every((slot) => !slot.product_id || (levels[slot.selection_number] ?? slot.stock) === slot.capacity);

  function stop() {
    setEditing(false);
    setLevels({});
  }

  function save() {
    setResult(null);
    setToast(null);
    const count = changed.length;
    startTransition(async () => {
      try {
        await correctStock(
          machineId,
          changed.map((s) => ({ selection: s.selection_number, level: levels[s.selection_number] })),
        );
        haptic("success");
        stop();
        setResult("saved");
        setToast(count);
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

  function start() {
    setResult(null);
    setEditing(true);
  }

  const picture = (
    <>
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
    </>
  );
  // A big green check in the middle of the screen for a moment, wherever the page was scrolled to, and a small one
  // that stays above the slots.
  const saved = result === "saved" && (
    <p role="status" className="flex items-center gap-1.5 px-1 text-[15px] font-semibold text-positive">
      <CircleCheck className="size-5 shrink-0" aria-hidden="true" />
      {m.stock.correctionSaved}
    </p>
  );
  const savedToast =
    toast !== null &&
    createPortal(
      <div
        aria-hidden="true"
        onClick={() => setToast(null)}
        className="fixed inset-0 z-50 grid place-items-center bg-black/15 p-6 duration-200 animate-in fade-in-0"
      >
        <div className="flex w-full max-w-xs flex-col items-center gap-5 rounded-3xl bg-card px-6 py-8 shadow-[var(--shadow-pop)] duration-300 animate-in zoom-in-75">
          <span className="grid size-28 place-items-center rounded-full bg-positive text-white">
            <Check className="size-16" strokeWidth={3.25} />
          </span>
          <p className="text-center text-[19px] font-semibold leading-snug tracking-[-0.01em]">
            {plural(toast, m.stock.savedSlotsOne, m.stock.savedSlots)}
          </p>
        </div>
      </div>,
      document.body,
    );
  const bar = editing && (
    // Clears the tab bar on phones, the iPhone's home bar included.
    <div className="surface-card sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 mt-2 flex flex-col gap-2 bg-card/95 p-3 backdrop-blur-xl lg:bottom-4">
      <Button size="lg" variant="outline" onClick={fillAll} disabled={busy || allFull} className="w-full sm:w-auto sm:self-start">
        <PackagePlus />
        {m.refill.fillAllSlots}
      </Button>
      {/* Side by side where they fit, under each other on a narrow phone, never over the edge. */}
      <div className="flex flex-wrap gap-2">
        <Button size="lg" onClick={save} disabled={busy || changed.length === 0} className="grow sm:grow-0">
          {busy ? m.common.saving : m.stock.saveCorrection}
        </Button>
        <Button size="lg" variant="outline" onClick={stop} disabled={busy} className="grow sm:grow-0">
          {m.common.cancel}
        </Button>
      </div>
      {result === "error" && <span className="px-1 text-sm text-negative">{m.common.error}</span>}
    </div>
  );

  if (embedded) {
    return editing ? (
      <div className="flex flex-col gap-3">
        <p className="px-1 text-[13px] text-muted-foreground">{m.refill.countsEditingHint}</p>
        {picture}
        {bar}
      </div>
    ) : (
      <>
        {saved && <div className="mb-4">{saved}</div>}
        {embedded.idle}
        {savedToast}
        <div className="mt-6 flex flex-wrap gap-2">
          {slots.length > 0 && (
            <Button variant="secondary" onClick={start}>
              <SlidersHorizontal />
              {embedded.label}
            </Button>
          )}
          {embedded.actions}
        </div>
      </>
    );
  }

  return (
    <Section title={m.refill.stockTitle} hint={editing ? m.refill.countsEditingHint : m.refill.countsHint}>
      {!editing && (
        <Button
          size="lg"
          variant="outline"
          onClick={start}
          className="w-full sm:w-auto sm:self-start"
        >
          <SlidersHorizontal />
          {m.refill.adjustCounts}
        </Button>
      )}
      {!editing && saved}
      {picture}
      {bar}
      {savedToast}
    </Section>
  );
}
