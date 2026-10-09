"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, Minus, Plus } from "lucide-react";
import { ExpiryPicker } from "@/components/refill/date-picker";
import { FrontView } from "@/components/machine/front-view";
import { Avatar, RowList, initial as initialOf } from "@/components/list-row";
import { Section } from "@/components/page-header";
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
  // Correction: start from what MATO Insights thinks is in there now.
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
    <div className="show-numbers grid gap-8 lg:grid-cols-[1.1fr_1fr]">
      <div className="lg:order-2 lg:sticky lg:top-24 lg:self-start">
        <div className="overflow-hidden rounded-2xl">
          <FrontView rows={preview} />
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-8">
        {datedSlots.length > 1 && (
          <div className="surface-card flex items-start gap-3.5 p-4">
            <Avatar>
              <CalendarDays />
            </Avatar>
            <div className="flex min-w-0 flex-1 flex-col gap-2.5 pt-2">
              <span className="text-[15px] font-semibold tracking-[-0.01em]">{m.refill.sameDateForAll}</span>
              <ExpiryPicker
                value={sharedDate}
                onChange={(date) =>
                  setDates(Object.fromEntries(datedSlots.map((s) => [s.selection_number, date])))
                }
                shelfLifeDays={shortest}
              />
            </div>
          </div>
        )}

        {[...rows.entries()]
          .sort(([a], [b]) => a - b)
          .map(([rowPosition, rowSlots]) => (
            <section key={rowPosition} className="flex flex-col gap-2">
              <p className="eyebrow px-1">{fmt(m.layout.row, { number: rowPosition + 1 })}</p>
              <RowList>
                {rowSlots.map((s) => {
                  const value = levels[s.selection_number];
                  const disabled = !s.product_id;
                  // What is in the slot right now: empty, part full, or full.
                  const current = s.stock;
                  const dot =
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
                      className={cn(
                        // A phone puts the stepper under the name so the name keeps
                        // its width; a wider screen gives it the right-hand column.
                        "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1.5 rounded-xl px-3 py-3 sm:gap-y-0.5",
                        disabled && "opacity-50",
                      )}
                    >
                      <Avatar className="col-start-1 row-span-2 row-start-1 overflow-hidden">
                        {s.photo_path ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={mediaUrl(s.photo_path)!} alt="" className="max-h-7 max-w-7 object-contain" />
                        ) : (
                          initialOf(s.product_name ?? "")
                        )}
                      </Avatar>
                      <span className="col-span-2 col-start-2 row-start-1 flex min-w-0 items-baseline gap-2 sm:col-span-1 sm:col-start-2">
                        <span className="min-w-6 shrink-0 font-mono text-[14px] font-bold">{s.selection_number}</span>
                        <span className="truncate text-[15px] font-semibold tracking-[-0.01em]">
                          {s.product_name ?? m.stock.noProduct}
                        </span>
                      </span>
                      <span className="col-start-2 row-start-2 flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
                        <span className={cn("size-1.5 shrink-0 rounded-full", dot)} aria-hidden="true" />
                        <span className="truncate">
                          {m.stock.now}: {s.stock ?? "?"} / {s.capacity}
                        </span>
                      </span>
                      {!disabled && (
                        <span className="col-start-3 row-start-2 flex items-center gap-1 rounded-full bg-surface p-1 sm:row-span-2 sm:row-start-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => set(s.selection_number, value - 1, s.capacity)}
                            aria-label="−"
                            className="text-foreground hover:bg-card"
                          >
                            <Minus />
                          </Button>
                          <span
                            className={cn(
                              "tabular w-9 text-center text-[17px] font-semibold tracking-[-0.02em]",
                              value !== initial[s.selection_number] && "text-chart-2",
                            )}
                          >
                            {value}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => set(s.selection_number, value + 1, s.capacity)}
                            aria-label="+"
                            className="text-foreground hover:bg-card"
                          >
                            <Plus />
                          </Button>
                        </span>
                      )}
                      {!disabled && suggested(s) && levels[s.selection_number] > (s.stock ?? 0) && (
                        <ExpiryPicker
                          value={dates[s.selection_number] ?? suggested(s)!}
                          onChange={(date) => setDates((d) => ({ ...d, [s.selection_number]: date }))}
                          shelfLifeDays={days(s)}
                          className="col-span-2 col-start-2 row-start-3 mt-1.5"
                        />
                      )}
                    </li>
                  );
                })}
              </RowList>
            </section>
          ))}

        <Section title={m.refill.checklistTitle}>
          <RowList>
            {CHECK_KEYS.map((key) => (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => setChecks((c) => ({ ...c, [key]: !c[key] }))}
                  aria-pressed={!!checks[key]}
                  className="hover-surface flex min-h-14 w-full items-center gap-3.5 rounded-xl px-3 py-3 text-left text-[15px] font-medium"
                >
                  <span
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-full border transition-colors duration-150",
                      checks[key] ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card",
                    )}
                  >
                    {checks[key] && <Check className="size-3.5" strokeWidth={3} />}
                  </span>
                  {m.refill.checklist[key]}
                </button>
              </li>
            ))}
          </RowList>
        </Section>

        <label className="flex flex-col gap-2">
          <span className="px-1 text-[15px] font-semibold tracking-[-0.01em]">{m.refill.filler}</span>
          <input
            value={filler}
            onChange={(e) => {
              setFiller(e.target.value);
              setNameMissing(false);
            }}
            autoComplete="name"
            aria-invalid={nameMissing || undefined}
            className={cn(
              "h-12 w-full rounded-xl border border-input bg-card px-4 text-base outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25",
              nameMissing && "border-negative focus-visible:border-negative focus-visible:ring-negative/20",
            )}
          />
          <span className={cn("px-1 text-[13px]", nameMissing ? "text-negative" : "text-muted-foreground")}>
            {nameMissing ? m.refill.fillerRequired : m.refill.fillerHint}
          </span>
        </label>

        {/* Clears the tab bar on phones, the iPhone's home bar included. */}
        <div className="surface-card sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 flex flex-col gap-3 bg-card/90 p-3 backdrop-blur-xl sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 lg:bottom-4">
          <Button size="lg" onClick={save} disabled={isPending} className="order-2 w-full sm:order-none sm:w-auto">
            {isPending ? m.common.saving : mode === "refill" ? m.stock.fillAll : m.stock.saveCorrection}
          </Button>
          <div className="order-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-1 sm:order-none sm:flex-1">
            {mode === "refill" && (
              <span className="text-sm font-semibold">{fmt(m.stock.totalAdded, { count: added })}</span>
            )}
            <span className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-negative" />
                {m.stock.empty}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-warning" />
                {m.machines.legendHalf}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-positive" />
                {m.stock.fill}
              </span>
            </span>
          </div>
          {error && <span className="order-1 px-1 text-sm text-negative sm:order-none">{m.common.error}</span>}
        </div>
      </div>
    </div>
  );
}

/** Slots with a product whose level is being raised. */
function editableWithGain(slots: SlotStock[], levels: Record<string, number>) {
  return slots.filter((s) => s.product_id && levels[s.selection_number] > (s.stock ?? 0));
}
