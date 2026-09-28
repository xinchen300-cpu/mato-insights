"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Minus, Plus } from "lucide-react";
import { ExpiryPicker } from "@/components/refill/date-picker";
import { FrontView } from "@/components/machine/front-view";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { toFrontRows } from "@/lib/layout";
import { mediaUrl } from "@/lib/media";
import type { SlotStock } from "@/lib/types";
import { addDays } from "@/lib/expiry";
import { recordStock } from "../../actions";

const CHECK_KEYS = ["expired", "clean", "labels", "test"] as const;
const FILLER_KEY = "vendly-filler";

export function StockForm({
  machineId,
  slots,
  mode,
  shelfLife,
}: {
  machineId: string;
  slots: SlotStock[];
  mode: "refill" | "correction";
  /** Days a product keeps, by product id; null when it has no shelf life. */
  shelfLife: Record<string, number | null>;
}) {
  const { m } = useI18n();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  // Refill: everything starts full, only differences get changed.
  // Correction: start from what Vendly thinks is in there now.
  const initial = useMemo(
    () =>
      Object.fromEntries(
        slots.map((s) => [s.selection_number, mode === "refill" ? s.capacity : (s.stock ?? 0)]),
      ) as Record<string, number>,
    [slots, mode],
  );
  const [levels, setLevels] = useState<Record<string, number>>(initial);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [dates, setDates] = useState<Record<string, string>>({});
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [filler, setFiller] = useState("");
  const [nameMissing, setNameMissing] = useState(false);

  useEffect(() => {
    try {
      setFiller(localStorage.getItem(FILLER_KEY) ?? "");
    } catch {}
  }, []);

  const days = (s: SlotStock) => (s.product_id ? (shelfLife[s.product_id] ?? null) : null);
  const suggested = (s: SlotStock) => {
    const d = days(s);
    return d ? addDays(d) : null;
  };
  // Only slots that actually gain stock need a date.
  const gaining = editableWithGain(slots, levels);
  const datedSlots = gaining.filter((s) => suggested(s));
  const shortest = datedSlots.length ? Math.min(...datedSlots.map((s) => days(s) ?? 0)) : 0;
  const sharedDate = datedSlots.length
    ? (dates[datedSlots[0]!.selection_number] ?? suggested(datedSlots[0]!)!)
    : "";

  const editable = slots.filter((s) => s.product_id);
  const added = editable.reduce((sum, s) => sum + Math.max(0, levels[s.selection_number] - (s.stock ?? 0)), 0);

  function set(selection: string, value: number, capacity: number) {
    setLevels((l) => ({ ...l, [selection]: Math.max(0, Math.min(capacity, value)) }));
    setTouched((t) => new Set(t).add(selection));
  }

  function save() {
    if (!filler.trim()) {
      setNameMissing(true);
      return;
    }
    try {
      localStorage.setItem(FILLER_KEY, filler.trim());
    } catch {}
    const targets = mode === "refill" ? editable : editable.filter((s) => touched.has(s.selection_number));
    if (targets.length === 0) return router.push(`/machines/${machineId}`);

    setError(false);
    startTransition(async () => {
      try {
        await recordStock(
          machineId,
          mode,
          targets.map((s) => ({
            selection: s.selection_number,
            level_after: levels[s.selection_number],
            expires_on:
              levels[s.selection_number] > (s.stock ?? 0)
                ? (dates[s.selection_number] ?? suggested(s))
                : null,
          })),
          filler,
          checks,
        );
        router.push(`/machines/${machineId}`);
        router.refresh();
      } catch {
        setError(true);
      }
    });
  }

  const preview = toFrontRows(slots.map((s) => ({ ...s, stock: s.product_id ? levels[s.selection_number] : s.stock })));

  const rows = new Map<number, SlotStock[]>();
  for (const s of slots) rows.set(s.row_position, [...(rows.get(s.row_position) ?? []), s]);

  return (
    <div className="show-numbers grid gap-6 lg:grid-cols-[1.1fr_1fr]">
      <div className="lg:order-2 lg:sticky lg:top-24 lg:self-start">
        <FrontView rows={preview} />
      </div>

      <div className="flex flex-col gap-5">
        {datedSlots.length > 1 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border bg-card p-4">
            <span className="text-[15px] font-semibold">{m.refill.sameDateForAll}</span>
            <ExpiryPicker
              value={sharedDate}
              onChange={(date) =>
                setDates(Object.fromEntries(datedSlots.map((s) => [s.selection_number, date])))
              }
              shelfLifeDays={shortest}
            />
          </div>
        )}

        {[...rows.entries()]
          .sort(([a], [b]) => a - b)
          .map(([rowPosition, rowSlots]) => (
            <section key={rowPosition}>
              <p className="eyebrow mb-2">{fmt(m.layout.row, { number: rowPosition + 1 })}</p>
              <ul className="flex flex-col divide-y border bg-card">
                {rowSlots.map((s) => {
                  const value = levels[s.selection_number];
                  const disabled = !s.product_id;
                  // What is in the slot right now: empty, part full, or full.
                  const current = s.stock;
                  const stripe =
                    disabled || current === null
                      ? "bg-transparent"
                      : current === 0
                        ? "bg-negative"
                        : current >= s.capacity
                          ? "bg-positive"
                          : "bg-warning";
                  return (
                    <li
                      key={s.slot_id}
                      className={cn("flex items-center gap-3 py-2.5 pr-3", disabled && "opacity-50")}
                    >
                      <span className={cn("h-9 w-1.5 shrink-0", stripe)} aria-hidden />
                      <span className="w-8 shrink-0 font-mono text-sm font-bold">{s.selection_number}</span>
                      <span className="grid size-9 shrink-0 place-items-center">
                        {s.photo_path && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={mediaUrl(s.photo_path)!} alt="" className="max-h-9 max-w-9 object-contain" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {s.product_name ?? m.stock.noProduct}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {m.stock.now}: {s.stock ?? "?"} / {s.capacity}
                        </span>
                      </span>
                      {!disabled && suggested(s) && levels[s.selection_number] > (s.stock ?? 0) && (
                        <ExpiryPicker
                          value={dates[s.selection_number] ?? suggested(s)!}
                          onChange={(date) => setDates((d) => ({ ...d, [s.selection_number]: date }))}
                          shelfLifeDays={days(s)}
                          className="shrink-0"
                        />
                      )}
                      {!disabled && (
                        <span className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            onClick={() => set(s.selection_number, value - 1, s.capacity)}
                            aria-label="−"
                          >
                            <Minus />
                          </Button>
                          <span
                            className={cn(
                              "tabular w-9 text-center font-heading text-lg font-semibold",
                              value !== initial[s.selection_number] && "text-accent-foreground",
                            )}
                          >
                            {value}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            onClick={() => set(s.selection_number, value + 1, s.capacity)}
                            aria-label="+"
                          >
                            <Plus />
                          </Button>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

        <section className="border bg-card p-4">
          <h2 className="text-xl">{m.refill.checklistTitle}</h2>
          <ul className="mt-3 flex flex-col divide-y">
            {CHECK_KEYS.map((key) => (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => setChecks((c) => ({ ...c, [key]: !c[key] }))}
                  aria-pressed={!!checks[key]}
                  className="flex w-full items-center gap-3 py-3 text-left text-[15px]"
                >
                  <span
                    className={cn(
                      "grid size-6 shrink-0 place-items-center border",
                      checks[key] ? "border-primary bg-primary text-primary-foreground" : "bg-card",
                    )}
                  >
                    {checks[key] && <Check className="size-4" strokeWidth={3} />}
                  </span>
                  {m.refill.checklist[key]}
                </button>
              </li>
            ))}
          </ul>

          <label className="mt-4 block">
            <span className="text-[15px] font-semibold">{m.refill.filler}</span>
            <input
              value={filler}
              onChange={(e) => {
                setFiller(e.target.value);
                setNameMissing(false);
              }}
              autoComplete="name"
              className={cn(
                "mt-1.5 w-full border bg-card px-3 py-2 text-base outline-none focus-visible:border-ring",
                nameMissing && "border-negative",
              )}
            />
            <span className={cn("mt-1 block text-xs", nameMissing ? "text-negative" : "text-muted-foreground")}>
              {nameMissing ? m.refill.fillerRequired : m.refill.fillerHint}
            </span>
          </label>
        </section>

        <div className="sticky bottom-20 z-10 flex flex-wrap items-center gap-3 border bg-card/95 p-4 backdrop-blur md:bottom-4">
          <Button size="lg" onClick={save} disabled={isPending}>
            {isPending ? m.common.saving : mode === "refill" ? m.stock.fillAll : m.stock.saveCorrection}
          </Button>
          {mode === "refill" && (
            <span className="text-sm text-muted-foreground">{fmt(m.stock.totalAdded, { count: added })}</span>
          )}
          <span className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 bg-negative" />
              {m.stock.empty}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 bg-warning" />
              {m.machines.legendHalf}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 bg-positive" />
              {m.stock.fill}
            </span>
          </span>
          {error && <span className="text-sm text-negative">{m.common.error}</span>}
        </div>
      </div>
    </div>
  );
}

/** Slots with a product whose level is being raised. */
function editableWithGain(slots: SlotStock[], levels: Record<string, number>) {
  return slots.filter((s) => s.product_id && levels[s.selection_number] > (s.stock ?? 0));
}
