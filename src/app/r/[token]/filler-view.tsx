"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { mediaUrl } from "@/lib/media";
import { ExpiryPicker } from "@/components/refill/date-picker";
import { combineByProduct, groupByMachine, lineKey, suggestedDate } from "@/lib/refill";
import type { RefillLine } from "@/lib/types";
import { completeSheet, saveBox } from "./actions";

const CHECK_KEYS = ["expired", "clean", "labels", "test"] as const;
// The name outlives one sheet: the same person usually fills again next week.
const FILLER_KEY = "vendly-filler";

export function FillerView({
  token,
  lines,
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
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [nameMissing, setNameMissing] = useState(false);
  const [short, setShort] = useState<Record<string, number>>({});
  const [expiry, setExpiry] = useState<"none" | "found" | null>(null);
  const [expiryMissing, setExpiryMissing] = useState(false);
  const [km, setKm] = useState("");
  const [isPending, startTransition] = useTransition();

  // Ticks survive a reload or a dropped connection in the storage room.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
      if (Array.isArray(saved.ticked)) setTicked(new Set(saved.ticked));
      if (saved.amounts && typeof saved.amounts === "object") setAmounts(saved.amounts);
      if (saved.dates && typeof saved.dates === "object") setDates(saved.dates);
      if (saved.checks && typeof saved.checks === "object") setChecks(saved.checks);
      if (saved.short && typeof saved.short === "object") setShort(saved.short);
      setFiller(localStorage.getItem(FILLER_KEY) ?? "");
    } catch {}
  }, [storageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ ticked: [...ticked], amounts, dates, checks, short }));
    } catch {}
  }, [storageKey, ticked, amounts, dates, checks, short]);

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
    startTransition(async () => {
      const result = await completeSheet(
        token,
        adjustments,
        expiries,
        filler,
        checks,
        km.trim() === "" ? null : Number(km.replace(",", ".")),
        Object.entries(short)
          .filter(([, qty]) => qty > 0)
          .map(([product_id, qty]) => ({ product_id, qty })),
        expiry !== null,
      );
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
      <div className="flex flex-col items-center gap-3 border bg-card p-10 text-center">
        <CircleCheck className="size-10 text-positive" />
        <p className="font-heading text-xl font-semibold text-heading">
          {status === "done" ? m.refill.done : m.refill.alreadyDone}
        </p>
      </div>
    );
  }

  const combined = combineByProduct(lines);
  const machines = groupByMachine(lines);

  // Lines that carry a date at all, and the date they share when they agree.
  const dated = lines.filter((l) => suggestedDate(l));
  const shortest = dated.length ? Math.min(...dated.map((l) => l.shelf_life_days ?? 0)) : 0;
  const currentDates = new Set(dated.map((l) => dates[lineKey(l)] ?? suggestedDate(l)));
  // No line carries a shelf life on some sheets, so dated[0] can be missing.
  const sharedDate =
    currentDates.size === 1 ? ([...currentDates][0] ?? "") : (dated[0] ? (suggestedDate(dated[0]) ?? "") : "");
  const setAllDates = (date: string) =>
    setDates(Object.fromEntries(dated.map((l) => [lineKey(l), date])));

  return (
    <div className="show-numbers flex flex-col gap-8 pb-28">
      {notes && (
        <div className="border border-primary/30 bg-accent p-4 text-[15px]">
          <p className="eyebrow mb-1">{m.refill.notes}</p>
          <p className="whitespace-pre-wrap">{notes}</p>
        </div>
      )}

      {dated.length > 1 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border bg-card p-4">
          <span className="text-[15px] font-semibold">{m.refill.sameDateForAll}</span>
          <ExpiryPicker value={sharedDate} onChange={setAllDates} shelfLifeDays={shortest} />
        </div>
      )}

      <section>
        <h2 className="text-xl">{m.refill.combined}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{m.refill.shortHint}</p>
        <ul className="mt-3 flex flex-col divide-y border bg-card">
          {combined.map((row) => (
            <li key={row.productId} className="flex items-center gap-3 px-4 py-3">
              {row.photoPath && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl(row.photoPath)!} alt="" className="size-8 object-contain" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate">{row.name}</span>
                {(short[row.productId] ?? 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => setShort((sh) => ({ ...sh, [row.productId]: 0 }))}
                    className="text-xs font-semibold text-negative underline underline-offset-2"
                  >
                    {fmt(m.refill.shortCount, { count: short[row.productId] })} &middot; {m.refill.shortClear}
                  </button>
                )}
              </span>
              <span className="tabular font-heading text-lg font-semibold">{row.quantity}</span>
              <button
                type="button"
                onClick={() =>
                  setShort((sh) => ({
                    ...sh,
                    [row.productId]: Math.min(row.quantity, (sh[row.productId] ?? 0) + 1),
                  }))
                }
                className="shrink-0 border px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:border-negative hover:text-negative"
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
          <section key={machine.machineId}>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-xl">{machine.name}</h2>
              <span className="text-sm text-muted-foreground">
                {fmt(m.refill.progress, { done, total: machine.lines.length })}
              </span>
            </div>
            <ul className="mt-3 flex flex-col divide-y border bg-card">
              {machine.lines.map((line) => {
                const key = lineKey(line);
                const isTicked = ticked.has(key);
                const amount = amounts[key] ?? line.to_add;
                return (
                  <li
                    key={key}
                    className={cn(
                      "flex flex-wrap items-center gap-3 px-3 py-3",
                      isTicked && "bg-positive/10",
                      line.qty_expired > 0 && "border-l-4 border-l-negative",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(key)}
                      aria-pressed={isTicked}
                      className={cn(
                        "grid size-9 shrink-0 place-items-center border-2 transition-colors",
                        isTicked ? "border-positive bg-positive text-white" : "border-input bg-card",
                      )}
                    >
                      {isTicked && <Check className="size-5" strokeWidth={3} />}
                    </button>
                    <span className="w-8 shrink-0 font-mono text-sm font-bold">{line.selection_number}</span>
                    <span className={cn("min-w-0 flex-1 text-[15px]", isTicked && "text-muted-foreground line-through")}>
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
                        "tabular h-10 w-16 border border-input bg-card text-center font-heading text-lg font-semibold",
                        amount !== line.to_add && "border-primary text-accent-foreground",
                      )}
                    />
                    <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 pl-12 text-xs">
                      {line.qty_expired > 0 && (
                        <span className="font-semibold text-negative">
                          {fmt(m.refill.pullFirst, { count: line.qty_expired })}
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
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <section className={cn("border bg-card p-4", expiryMissing && "border-negative")}>
        <h2 className="text-xl">{m.refill.expiryTitle}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{m.refill.expiryHint}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
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
                "flex items-center gap-2.5 border px-4 py-3 text-left text-[15px] font-semibold",
                expiry === choice
                  ? choice === "none"
                    ? "border-positive bg-positive/10"
                    : "border-negative bg-negative/10"
                  : "bg-card",
              )}
            >
              <span
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-full border",
                  expiry === choice && (choice === "none" ? "border-positive" : "border-negative"),
                )}
              >
                {expiry === choice && (
                  <span className={cn("size-2.5 rounded-full", choice === "none" ? "bg-positive" : "bg-negative")} />
                )}
              </span>
              {choice === "none" ? m.refill.expiryNone : m.refill.expiryFound}
            </button>
          ))}
        </div>
        {expiryMissing && <p className="mt-2 text-sm text-negative">{m.refill.expiryRequired}</p>}
      </section>

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
          <span className="text-[15px] font-semibold">{m.refill.kmLabel}</span>
          <input
            value={km}
            onChange={(e) => setKm(e.target.value.replace(/[^0-9.,]/g, ""))}
            inputMode="decimal"
            className="mt-1.5 w-32 border bg-card px-3 py-2 text-base outline-none focus-visible:border-ring"
          />
          <span className="mt-1 block text-xs text-muted-foreground">{m.refill.kmHint}</span>
        </label>

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

      <div className="fixed inset-x-0 bottom-0 border-t bg-card/95 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex max-w-2xl flex-col gap-2">
          <p className="text-xs text-muted-foreground">{m.refill.adjustHint}</p>
          {status === "error" && <p className="text-sm text-negative">{m.common.error}</p>}
          <Button size="lg" onClick={confirm} disabled={isPending} className="w-full">
            <CircleCheck />
            {isPending ? m.refill.confirming : m.refill.filledAsPlanned}
          </Button>
        </div>
      </div>
    </div>
  );
}
