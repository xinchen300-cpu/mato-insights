"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus } from "lucide-react";
import { Avatar, RowList, initial } from "@/components/list-row";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { mediaUrl } from "@/lib/media";
import type { SlotStock } from "@/lib/types";
import { cn } from "@/lib/utils";
import { correctStock } from "../../actions";

/**
 * Every product in the machine with a minus and a plus, for whoever fills it
 * (Xin, 17-10-2026): what is really in a slot, set right on the spot. Only what
 * changed is sent, as a correction; nothing goes before "save".
 */
export function StockAdjust({ machineId, slots }: { machineId: string; slots: SlotStock[] }) {
  const { m } = useI18n();
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [result, setResult] = useState<"saved" | "error" | null>(null);

  const valueOf = (slot: SlotStock) => levels[slot.selection_number] ?? slot.stock ?? 0;
  // A slot nobody counted yet changes as soon as it is given a number, even 0.
  const changed = slots.filter((slot) => slot.selection_number in levels && levels[slot.selection_number] !== slot.stock);

  function set(slot: SlotStock, value: number) {
    setResult(null);
    setLevels((current) => ({ ...current, [slot.selection_number]: Math.max(0, Math.min(slot.capacity, value)) }));
  }

  function save() {
    setResult(null);
    startTransition(async () => {
      try {
        await correctStock(
          machineId,
          changed.map((slot) => ({ selection: slot.selection_number, level: levels[slot.selection_number] })),
        );
        setLevels({});
        setResult("saved");
        router.refresh();
      } catch {
        setResult("error");
      }
    });
  }

  const rows = new Map<number, SlotStock[]>();
  for (const slot of slots) rows.set(slot.row_position, [...(rows.get(slot.row_position) ?? []), slot]);

  return (
    <div className="flex flex-col gap-6">
      {[...rows.entries()]
        .sort(([a], [b]) => a - b)
        .map(([rowPosition, rowSlots]) => (
          <section key={rowPosition} className="flex flex-col gap-2">
            <p className="eyebrow px-1">{fmt(m.layout.row, { number: rowPosition + 1 })}</p>
            <RowList>
              {rowSlots.map((slot) => {
                const value = valueOf(slot);
                const moved = changed.includes(slot);
                return (
                  <li key={slot.slot_id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3.5 rounded-xl px-3 py-3">
                    <Avatar className="overflow-hidden">
                      {slot.photo_path ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={mediaUrl(slot.photo_path)!} alt="" className="max-h-7 max-w-7 object-contain" />
                      ) : (
                        initial(slot.product_name ?? "")
                      )}
                    </Avatar>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="min-w-6 shrink-0 font-mono text-[14px] font-bold">{slot.selection_number}</span>
                        <span className="truncate text-[15px] font-semibold tracking-[-0.01em]">{slot.product_name ?? m.stock.noProduct}</span>
                      </span>
                      <span className="truncate text-[13px] text-muted-foreground">
                        {m.stock.now}: {slot.stock ?? "?"} / {slot.capacity}
                      </span>
                    </span>
                    <span className="flex items-center gap-1 rounded-full bg-surface p-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => set(slot, value - 1)}
                        disabled={busy || value <= 0}
                        aria-label="−"
                        className="text-foreground hover:bg-card"
                      >
                        <Minus />
                      </Button>
                      <span className={cn("tabular w-9 text-center text-[17px] font-semibold tracking-[-0.02em]", moved && "text-chart-2")}>
                        {slot.selection_number in levels || slot.stock !== null ? value : "?"}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => set(slot, value + 1)}
                        disabled={busy || value >= slot.capacity}
                        aria-label="+"
                        className="text-foreground hover:bg-card"
                      >
                        <Plus />
                      </Button>
                    </span>
                  </li>
                );
              })}
            </RowList>
          </section>
        ))}

      {(changed.length > 0 || result) && (
        // Clears the tab bar on phones, the iPhone's home bar included.
        <div className="surface-card sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 flex flex-wrap items-center gap-3 bg-card/90 p-3 backdrop-blur-xl lg:bottom-4">
          {changed.length > 0 && (
            <>
              <Button size="lg" onClick={save} disabled={busy} className="flex-1 sm:flex-none">
                {busy ? m.common.saving : m.stock.saveCorrection}
              </Button>
              <Button size="lg" variant="outline" onClick={() => setLevels({})} disabled={busy}>
                {m.common.cancel}
              </Button>
            </>
          )}
          {result === "saved" && changed.length === 0 && <span className="px-1 text-sm font-semibold text-positive">{m.stock.correctionSaved}</span>}
          {result === "error" && <span className="px-1 text-sm text-negative">{m.common.error}</span>}
        </div>
      )}
    </div>
  );
}
