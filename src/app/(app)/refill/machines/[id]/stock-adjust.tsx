"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus } from "lucide-react";
import { FrontView, StockLegend } from "@/components/machine/front-view";
import { Avatar, initial } from "@/components/list-row";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { toFrontRows } from "@/lib/layout";
import { mediaUrl } from "@/lib/media";
import type { SlotStock } from "@/lib/types";
import { cn } from "@/lib/utils";
import { correctStock } from "../../actions";

/**
 * The machine's slots as a picture for whoever fills it, with the count set
 * right on it (Xin, 17-10-2026): tap a slot first, then its minus and plus
 * appear. The picture shows each new count as it is set, a changed slot says
 * what it was, and nothing is sent before "save", as one correction.
 */
export function StockAdjust({ machineId, slots }: { machineId: string; slots: SlotStock[] }) {
  const { m } = useI18n();
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<"saved" | "error" | null>(null);

  // A slot nobody counted yet changes as soon as it is given a number, even 0.
  const changed = slots.filter((slot) => slot.selection_number in levels && levels[slot.selection_number] !== slot.stock);
  const slot = slots.find((candidate) => candidate.slot_id === selected) ?? null;
  const value = slot ? (levels[slot.selection_number] ?? slot.stock ?? 0) : 0;

  const rows = toFrontRows(
    slots.map((s) => (s.selection_number in levels ? { ...s, stock: levels[s.selection_number] } : s)),
  ).map((row) =>
    row.map((front) => {
      const before = changed.find((s) => s.slot_id === front.key);
      return before ? { ...front, badge: { text: `${before.stock ?? "?"} → ${front.stock}`, tone: "warning" as const } } : front;
    }),
  );

  function set(next: number) {
    if (!slot) return;
    setResult(null);
    setLevels((current) => ({ ...current, [slot.selection_number]: Math.max(0, Math.min(slot.capacity, next)) }));
  }

  function save() {
    setResult(null);
    startTransition(async () => {
      try {
        await correctStock(
          machineId,
          changed.map((s) => ({ selection: s.selection_number, level: levels[s.selection_number] })),
        );
        setLevels({});
        setSelected(null);
        setResult("saved");
        router.refresh();
      } catch {
        setResult("error");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <FrontView
        rows={rows}
        selectedKey={selected}
        onSlotClick={(front) => {
          setResult(null);
          setSelected((current) => (current === front.key ? null : front.key));
        }}
      />
      <StockLegend
        labels={{
          full: m.machines.legendFull,
          half: m.machines.legendHalf,
          low: m.machines.legendLow,
          empty: m.machines.legendEmpty,
          unknown: m.machines.legendUnknown,
        }}
      />

      {(slot || changed.length > 0 || result) && (
        // Clears the tab bar on phones, the iPhone's home bar included.
        <div className="surface-card sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 mt-2 flex flex-col gap-3 bg-card/95 p-3 backdrop-blur-xl lg:bottom-4">
          {slot && (
            <div className="flex items-center gap-3">
              <Avatar className="overflow-hidden">
                {slot.photo_path ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaUrl(slot.photo_path)!} alt="" className="max-h-7 max-w-7 object-contain" />
                ) : (
                  initial(slot.product_name ?? "")
                )}
              </Avatar>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="shrink-0 font-mono text-[14px] font-bold">{slot.selection_number}</span>
                  <span className="truncate text-[15px] font-semibold tracking-[-0.01em]">{slot.product_name ?? m.stock.noProduct}</span>
                </span>
                <span className="truncate text-[13px] text-muted-foreground">
                  {m.stock.now}: {slot.stock ?? "?"} / {slot.capacity}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-surface p-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => set(value - 1)}
                  disabled={busy || value <= 0}
                  aria-label="−"
                  className="text-foreground hover:bg-card"
                >
                  <Minus />
                </Button>
                <span
                  className={cn(
                    "tabular w-9 text-center text-[17px] font-semibold tracking-[-0.02em]",
                    changed.includes(slot) && "text-chart-2",
                  )}
                >
                  {slot.selection_number in levels || slot.stock !== null ? value : "?"}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => set(value + 1)}
                  disabled={busy || value >= slot.capacity}
                  aria-label="+"
                  className="text-foreground hover:bg-card"
                >
                  <Plus />
                </Button>
              </span>
            </div>
          )}
          {changed.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button size="lg" onClick={save} disabled={busy} className="flex-1 sm:flex-none">
                {busy ? m.common.saving : m.stock.saveCorrection}
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => {
                  setLevels({});
                  setSelected(null);
                }}
                disabled={busy}
              >
                {m.common.cancel}
              </Button>
            </div>
          )}
          {result === "saved" && changed.length === 0 && <span className="px-1 text-sm font-semibold text-positive">{m.stock.correctionSaved}</span>}
          {result === "error" && <span className="px-1 text-sm text-negative">{m.common.error}</span>}
        </div>
      )}
    </div>
  );
}
