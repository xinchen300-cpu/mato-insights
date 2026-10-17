"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Check, CircleCheck, RefreshCw } from "lucide-react";
import { Avatar, initial } from "@/components/list-row";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { mediaUrl } from "@/lib/media";
import { ExpiryPicker } from "@/components/refill/date-picker";
import { RefillTips } from "@/components/refill/refill-tips";
import { combineByProduct, groupByMachine, lineKey, suggestedDate } from "@/lib/refill";
import type { RefillLine } from "@/lib/types";
import { completeSheet, refreshLines, saveBox } from "./actions";

const CHECK_KEYS = ["expired", "clean", "labels", "test"] as const;
// The name outlives one sheet: the same person usually fills again next week.
const FILLER_KEY = "vendly-filler";
// Often enough that the list is never far off, rarely enough that a phone on a
// bad connection in a storage room is not busy all morning.
const REFRESH_MS = 90_000;

export function FillerView({
  token,
  lines: initialLines,
  notes,
  completed,
}: {
  token: string;
  lines: RefillLine[];
  notes: string | null;
  completed: boolean;
}) {
  const { m } = useI18n();
  const storageKey = `vendly-sheet-${token}`;
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  // Dates the filler sets; a line with a shelf life starts on today + that many days.
  const [dates, setDates] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "done" | "already_done" | "error">(completed ? "already_done" : "idle");
  const [filler, setFiller] = useState("");
  const [nameMissing, setNameMissing] = useState(false);
  const [short, setShort] = useState<Record<string, number>>({});
  const [expiry, setExpiry] = useState<"none" | "found" | null>(null);
  const [expiryMissing, setExpiryMissing] = useState(false);
  const [isPending, startTransition] = useTransition();
  // The list is not frozen: it is what the machines need right now.
  const [lines, setLines] = useState(initialLines);
  // Per slot, how much was sold since the filler last looked at it.
  const [sold, setSold] = useState<Record<string, number>>({});
  const [refreshing, setRefreshing] = useState(false);
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const tickedRef = useRef(ticked);
  tickedRef.current = ticked;
  const closingRef = useRef(false);

  // Ticks survive a reload or a dropped connection in the storage room.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
      if (Array.isArray(saved.ticked)) setTicked(new Set(saved.ticked));
      if (saved.amounts && typeof saved.amounts === "object") setAmounts(saved.amounts);
      if (saved.dates && typeof saved.dates === "object") setDates(saved.dates);
      if (saved.short && typeof saved.short === "object") setShort(saved.short);
      setFiller(localStorage.getItem(FILLER_KEY) ?? "");
    } catch {}
  }, [storageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ ticked: [...ticked], amounts, dates, short }));
    } catch {}
  }, [storageKey, ticked, amounts, dates, short]);

  // What is in the cool box is part of the run, so the shop can see it while
  // the filler is on the road. Written after a pause, not on every tap.
  useEffect(() => {
    const box: Record<string, number> = {};
    for (const line of lines) {
      if (!ticked.has(lineKey(line))) continue;
      const key = line.product_id ?? line.product_name ?? lineKey(line);
      box[key] = (box[key] ?? 0) + (amounts[lineKey(line)] ?? line.to_add);
    }
    const timer = setTimeout(() => {
      void saveBox(token, box).catch(() => {});
    }, 1200);
    return () => clearTimeout(timer);
  }, [lines, ticked, amounts, token]);

  /**
   * Ask what the machines need now. What the filler already ticked goes along
   * untouched: those pieces are in the cool box, so their number is settled
   * and the line must not vanish from the sheet either.
   */
  const refresh = useCallback(async () => {
    // Confirming is a stock count; a refresh landing mid-flight would rewrite
    // the very lines being booked.
    if (closingRef.current) return;
    setRefreshing(true);
    try {
      const packed = [...tickedRef.current];
      const fresh = await refreshLines(token, packed);
      if (!fresh) return;
      const before = new Map(linesRef.current.map((line) => [lineKey(line), line]));
      setSold((current) => {
        const next = { ...current };
        for (const line of fresh) {
          const key = lineKey(line);
          if (tickedRef.current.has(key)) continue;
          const grew = line.to_add - (before.get(key)?.to_add ?? line.to_add);
          if (grew > 0) next[key] = (next[key] ?? 0) + grew;
        }
        return next;
      });
      setLines(fresh);
    } catch {
      // Out of range at the machine; the list on screen is still usable.
    } finally {
      setRefreshing(false);
    }
  }, [token]);

  // The effect must not depend on refresh itself: every tick would otherwise
  // cancel the pending timer and the correction would never arrive.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  // While the run is open: on a timer, and whenever the filler comes back to
  // the tab after driving.
  useEffect(() => {
    if (completed || status !== "idle") return;
    const tick = () => {
      if (document.visibilityState === "visible") void refreshRef.current();
    };
    // Once on arrival, with whatever was already ticked, then on the clock.
    tick();
    const timer = setInterval(tick, REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [completed, status]);

  function toggle(key: string) {
    setTicked((t) => {
      const next = new Set(t);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function confirm() {
    if (expiry === null) {
      setExpiryMissing(true);
      return;
    }
    if (!filler.trim()) {
      setNameMissing(true);
      return;
    }
    try {
      localStorage.setItem(FILLER_KEY, filler.trim());
    } catch {}
    const adjustments = Object.fromEntries(
      lines
        .filter((l) => amounts[lineKey(l)] !== undefined && amounts[lineKey(l)] !== l.to_add)
        .map((l) => [lineKey(l), amounts[lineKey(l)]]),
    );
    const expiries = Object.fromEntries(
      lines.map((l) => [lineKey(l), dates[lineKey(l)] ?? suggestedDate(l)]).filter(([, date]) => date),
    ) as Record<string, string>;
    closingRef.current = true;
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof completeSheet>>;
      try {
        result = await completeSheet(
        token,
        adjustments,
        expiries,
        filler,
        {},
        // The kilometres come from the route the owner set, not from the filler's memory.
        null,
        Object.entries(short)
          .filter(([, qty]) => qty > 0)
          .map(([product_id, qty]) => ({ product_id, qty })),
        expiry !== null,
      );
      } catch {
        // No signal, or the server failed: nothing was closed, so the filler can try again.
        closingRef.current = false;
        setStatus("error");
        return;
      }
      if (result.status === "done" || result.status === "already_done") {
        try {
          localStorage.removeItem(storageKey);
        } catch {}
      }
      setStatus(result.status === "not_found" ? "error" : result.status);
    });
  }

  if (status === "done" || status === "already_done") {
    return (
      <div className="surface-card flex flex-col items-center gap-4 px-6 py-14 text-center">
        <span className="grid size-16 place-items-center rounded-full bg-positive/12 text-positive">
          <CircleCheck className="size-8" />
        </span>
        <p className="max-w-xs text-[22px] font-semibold leading-snug tracking-[-0.02em] text-heading">
          {status === "done" ? m.refill.done : m.refill.alreadyDone}
        </p>
      </div>
    );
  }

  const combined = combineByProduct(lines);
  const machines = groupByMachine(lines);
  const soldTotal = Object.values(sold).reduce((n, v) => n + v, 0);

  // Lines that carry a date at all, and the date they share when they agree.
  const dated = lines.filter((l) => suggestedDate(l));
  const shortest = dated.length ? Math.min(...dated.map((l) => l.shelf_life_days ?? 0)) : 0;
  const currentDates = new Set(dated.map((l) => dates[lineKey(l)] ?? suggestedDate(l)));
  // No line carries a shelf life on some sheets, so dated[0] can be missing.
  const sharedDate =
    currentDates.size === 1 ? ([...currentDates][0] ?? "") : (dated[0] ? (suggestedDate(dated[0]) ?? "") : "");
  const setAllDates = (date: string) =>
    setDates(Object.fromEntries(dated.map((l) => [lineKey(l), date])));

  // One look for every section title on this page: big enough to find with a
  // thumb on the screen and a crate under the other arm.
  const sectionTitle = "text-[22px] font-semibold tracking-[-0.025em]";

  return (
    <div className="show-numbers flex flex-col gap-10 pb-40">
      {notes && (
        <section className="surface-card px-5 py-4">
          <p className="mb-1.5 flex items-center gap-2 text-[13px] font-semibold text-muted-foreground">
            <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
            {m.refill.notes}
          </p>
          <p className="whitespace-pre-wrap text-[16px] leading-relaxed">{notes}</p>
        </section>
      )}

      {soldTotal > 0 && (
        <div className="surface-card flex items-center gap-3.5 px-4 py-3.5">
          <Avatar tone="gold">
            <RefreshCw />
          </Avatar>
          <p className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">{fmt(m.refill.soldMeanwhile, { count: soldTotal })}</span>{" "}
            <span className="mt-0.5 block text-[13px] text-muted-foreground">{m.refill.soldMeanwhileHint}</span>
          </p>
          <button
            type="button"
            onClick={() => setSold({})}
            className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "h-9 shrink-0")}
          >
            {m.refill.soldSeen}
          </button>
        </div>
      )}

      {dated.length > 1 && (
        <div className="surface-card flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5 px-4 py-3.5">
          <span className="text-[15px] font-semibold">{m.refill.sameDateForAll}</span>
          <ExpiryPicker value={sharedDate} onChange={setAllDates} shelfLifeDays={shortest} />
        </div>
      )}

      <section className="flex flex-col gap-3">
        <div className="px-1">
          <h2 className={sectionTitle}>{m.refill.combined}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{m.refill.shortHint}</p>
        </div>
        <ul className="surface-card flex flex-col p-2">
          {combined.map((row) => (
            <li
              key={row.productId}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-xl px-2 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:px-3"
            >
              {row.photoPath ? (
                <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full bg-surface">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mediaUrl(row.photoPath)!} alt="" className="size-8 object-contain" />
                </span>
              ) : (
                <Avatar className="size-11">{initial(row.name)}</Avatar>
              )}
              <span className="min-w-0">
                <span className="block truncate text-[16px] font-medium">{row.name}</span>
                {(short[row.productId] ?? 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => setShort((sh) => ({ ...sh, [row.productId]: 0 }))}
                    className="mt-0.5 inline-flex min-h-8 items-center gap-1.5 text-[13px] font-semibold text-negative"
                  >
                    <span className="size-1.5 rounded-full bg-negative" aria-hidden="true" />
                    {fmt(m.refill.shortCount, { count: short[row.productId] })} &middot;{" "}
                    <span className="underline underline-offset-2">{m.refill.shortClear}</span>
                  </button>
                )}
              </span>
              <span className="tabular text-[22px] font-semibold tracking-[-0.02em]">{row.quantity}</span>
              {/* On a phone the button drops under the name, so the name keeps its room. */}
              <button
                type="button"
                onClick={() =>
                  setShort((sh) => ({
                    ...sh,
                    [row.productId]: Math.min(row.quantity, (sh[row.productId] ?? 0) + 1),
                  }))
                }
                className="col-start-2 row-start-2 h-10 justify-self-start rounded-full bg-surface px-4 text-[13px] font-semibold text-muted-foreground transition-colors duration-150 hover:bg-negative/10 hover:text-negative sm:col-start-4 sm:row-start-1"
              >
                {m.refill.shortAdd}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {machines.map((machine) => {
        const done = machine.lines.filter((l) => ticked.has(lineKey(l))).length;
        return (
          <section key={machine.machineId} className="flex flex-col gap-3">
            <div className="px-1">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className={cn(sectionTitle, "min-w-0")}>{machine.name}</h2>
                <span className="tabular shrink-0 text-sm font-medium text-muted-foreground">
                  {fmt(m.refill.progress, { done, total: machine.lines.length })}
                </span>
              </div>
              <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-foreground/[0.07]" aria-hidden="true">
                <div
                  className="rail-fill h-full w-full rounded-full bg-positive"
                  style={{ transform: `scaleX(${machine.lines.length ? done / machine.lines.length : 0})` }}
                />
              </div>
            </div>
            <ul className="surface-card flex flex-col p-2">
              {machine.lines.map((line) => {
                const key = lineKey(line);
                const isTicked = ticked.has(key);
                const amount = amounts[key] ?? line.to_add;
                const hasMeta = line.qty_expired > 0 || (sold[key] ?? 0) > 0 || Boolean(suggestedDate(line));
                return (
                  <li
                    key={key}
                    className={cn(
                      "rounded-xl px-2 py-3 transition-colors duration-150 sm:px-3",
                      isTicked && "bg-positive/[0.07]",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => toggle(key)}
                        aria-pressed={isTicked}
                        aria-label={line.product_name}
                        className={cn(
                          "grid size-11 shrink-0 place-items-center rounded-full transition-colors duration-150",
                          isTicked
                            ? "bg-positive text-white"
                            : "bg-card shadow-[inset_0_0_0_1.5px_var(--input)] hover:bg-surface",
                        )}
                      >
                        {isTicked && <Check className="size-5" strokeWidth={3} />}
                      </button>
                      <span
                        className={cn(
                          "inline-grid h-7 min-w-9 shrink-0 place-items-center rounded-lg px-1.5 font-mono text-[13px] font-semibold",
                          line.qty_expired > 0 ? "bg-negative/10 text-negative" : "bg-surface",
                        )}
                      >
                        {line.selection_number}
                      </span>
                      <span
                        className={cn(
                          "min-w-0 flex-1 text-[16px] font-medium leading-snug",
                          isTicked && "text-muted-foreground line-through",
                        )}
                      >
                        {line.product_name}
                      </span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={999}
                        value={amount}
                        aria-label={m.refill.addedInstead}
                        onChange={(e) =>
                          setAmounts((a) => ({ ...a, [key]: Math.max(0, Math.min(999, Number(e.target.value) || 0)) }))
                        }
                        className={cn(
                          "tabular h-11 w-16 shrink-0 rounded-xl border border-input bg-card text-center text-[18px] font-semibold outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25",
                          amount !== line.to_add && "border-primary bg-primary/[0.06]",
                        )}
                      />
                    </div>
                    {hasMeta && (
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-14 text-[13px]">
                        {line.qty_expired > 0 && (
                          <span className="inline-flex items-center gap-1.5 font-semibold text-negative">
                            <span className="size-1.5 rounded-full bg-negative" aria-hidden="true" />
                            {fmt(m.refill.pullFirst, { count: line.qty_expired })}
                          </span>
                        )}
                        {(sold[key] ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                            <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
                            {fmt(m.refill.soldHere, { count: sold[key] })}
                          </span>
                        )}
                        {suggestedDate(line) && (
                          <ExpiryPicker
                            value={dates[key] ?? suggestedDate(line)!}
                            onChange={(date) => setDates((d) => ({ ...d, [key]: date }))}
                            shelfLifeDays={line.shelf_life_days}
                          />
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <section className="flex flex-col gap-3">
        <div className="px-1">
          <h2 className={sectionTitle}>{m.refill.expiryTitle}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{m.refill.expiryHint}</p>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {(["none", "found"] as const).map((choice) => (
            <button
              key={choice}
              type="button"
              aria-pressed={expiry === choice}
              onClick={() => {
                setExpiry(choice);
                setExpiryMissing(false);
              }}
              className={cn(
                "surface-card hover-surface flex min-h-16 items-center gap-3 px-4 py-3 text-left text-[16px] font-semibold",
                expiryMissing && "ring-[1.5px] ring-negative/60",
                expiry === choice &&
                  (choice === "none"
                    ? "bg-positive/10 ring-[1.5px] ring-positive"
                    : "bg-negative/10 ring-[1.5px] ring-negative"),
              )}
            >
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full border-[1.5px] border-input bg-card",
                  expiry === choice && (choice === "none" ? "border-positive" : "border-negative"),
                )}
              >
                {expiry === choice && (
                  <span className={cn("size-3 rounded-full", choice === "none" ? "bg-positive" : "bg-negative")} />
                )}
              </span>
              {choice === "none" ? m.refill.expiryNone : m.refill.expiryFound}
            </button>
          ))}
        </div>
        {expiryMissing && <p className="px-1 text-sm font-medium text-negative">{m.refill.expiryRequired}</p>}
      </section>

      <section className="flex flex-col gap-3">
        {/* Tips, not boxes to tick: refilling has to go smoothly (Xin, 14-10-2026). */}
        <RefillTips tips={CHECK_KEYS.map((key) => m.refill.checklist[key])} />

        <div className="surface-card mt-2 flex flex-col gap-6 p-5">
          <label className="block">
            <span className="text-[15px] font-semibold">{m.refill.filler}</span>
            <input
              value={filler}
              onChange={(e) => {
                setFiller(e.target.value);
                setNameMissing(false);
              }}
              autoComplete="name"
              className={cn(
                "mt-2 block h-12 w-full rounded-xl border border-input bg-card px-4 text-base outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25",
                nameMissing && "border-negative focus-visible:border-negative focus-visible:ring-negative/20",
              )}
            />
            <span className={cn("mt-1.5 block text-[13px]", nameMissing ? "font-medium text-negative" : "text-muted-foreground")}>
              {nameMissing ? m.refill.fillerRequired : m.refill.fillerHint}
            </span>
          </label>
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/90 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl flex-col gap-2.5 sm:px-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] text-muted-foreground">{m.refill.adjustHint}</p>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-muted-foreground transition-colors duration-150 hover:bg-surface hover:text-foreground disabled:pointer-events-none"
            >
              <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
              {refreshing ? m.refill.refreshing : m.refill.refresh}
            </button>
          </div>
          {status === "error" && <p className="text-sm font-medium text-negative">{m.common.error}</p>}
          <Button size="lg" onClick={confirm} disabled={isPending} className="h-14 w-full text-base">
            <CircleCheck />
            {isPending ? m.refill.confirming : m.refill.filledAsPlanned}
          </Button>
        </div>
      </div>
    </div>
  );
}
