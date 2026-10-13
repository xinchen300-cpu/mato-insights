"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Timer, TriangleAlert } from "lucide-react";
import { VendlyWordmark } from "@/components/brand/vendly-mark";
import { useI18n } from "@/i18n/client";
import { duration, fmt } from "@/i18n/format";
import type { RefillRound } from "@/lib/data";
import {
  allocate,
  pickList,
  returnsFor,
  slotKey,
  type Disposition,
  type RemovalReason,
  type ReturnRow,
  type StopRecord,
} from "@/lib/refill-flow";
import { cn } from "@/lib/utils";
import { completeRound, completeStop, savePicked, skipStop, startRound, type StopInput } from "./actions";

// The round as a checklist: pack, each machine, bring back. One list that
// always says where the filler is, a clock that runs by itself from the start,
// and at a machine nothing more than ticking off the slots as they go in.
// Progress is kept on the phone too, so a reload in a basement loses nothing.

type LineDraft = {
  /** Set once the slot is ticked off (or a number was typed); unset is "not yet". */
  filled?: number;
  removed: { reason: RemovalReason; qty: number }[];
  countAfter: number | null;
  full: boolean;
};
type StopDraft = {
  /** When the filler opened this machine: their arrival, for the operator's timings. */
  checkedAt: string | null;
  technical: boolean;
  note: string | null;
  allFull: boolean | null;
  lines: Record<string, LineDraft>;
};
type Saved = { picked: Record<string, number>; touched: boolean; drafts: Record<string, StopDraft> };
type ReportKind = RemovalReason | "count" | "technical";
type View = "home" | "pick" | "stop" | "returns";

const emptyDraft = (): StopDraft => ({ checkedAt: null, technical: false, note: null, allFull: null, lines: {} });
const emptyLine = (): LineDraft => ({ removed: [], countAfter: null, full: false });
const storageKey = (id: string) => `vendly-round-${id}`;

function load(id: string): Saved | null {
  try {
    const raw = localStorage.getItem(storageKey(id));
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

const primary =
  "flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-foreground text-[16px] font-semibold text-background transition-transform active:scale-[0.99] disabled:opacity-50";
const outline =
  "flex h-14 w-full items-center justify-center rounded-2xl border border-input bg-card text-[16px] font-semibold active:scale-[0.99]";
const ghost = "flex h-12 w-full items-center justify-center rounded-2xl text-[15px] font-semibold text-muted-foreground";
const stepper =
  "grid size-12 shrink-0 place-items-center rounded-full bg-surface text-2xl font-medium text-foreground active:scale-95 disabled:opacity-40";
const chip = "inline-flex h-10 items-center gap-1.5 rounded-full bg-card px-3.5 text-[14px] font-semibold ring-1 ring-border";

export function RoundFlow({ round: initial }: { round: RefillRound }) {
  const { m, f } = useI18n();
  const t = m.round;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [readyAt, setReadyAt] = useState(initial.readyAt);
  const [stops, setStops] = useState<Record<string, StopRecord>>(initial.stops);
  const [completed, setCompleted] = useState(Boolean(initial.completedAt));
  const [completedAt, setCompletedAt] = useState(initial.completedAt);
  const [picked, setPicked] = useState<Record<string, number>>(initial.picked);
  const [touched, setTouched] = useState(Object.keys(initial.picked).length > 0);
  const [drafts, setDrafts] = useState<Record<string, StopDraft>>({});
  const [restored, setRestored] = useState(false);

  const [view, setView] = useState<View>("home");
  const [stopId, setStopId] = useState<string | null>(null);
  const [report, setReport] = useState<{ selection: string | null } | null>(null);
  const [lineSheet, setLineSheet] = useState<string | null>(null);
  const [countSheet, setCountSheet] = useState<string | null>(null);
  const [showShort, setShowShort] = useState(false);
  const [unchecked, setUnchecked] = useState<number | null>(null);
  const [skipArmed, setSkipArmed] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const pendingStop = useRef<{ machineId: string; input: StopInput } | null>(null);

  // Bring back what this phone had before a reload; the server wins on what it
  // already has. Read after mounting: the server render has no localStorage.
  useEffect(() => {
    const saved = load(initial.id);
    if (saved) {
      if (!initial.readyAt && saved.touched) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one read of localStorage after mount
        setPicked(saved.picked);
        setTouched(true);
      }
      setDrafts(saved.drafts ?? {});
    }
    setRestored(true);
  }, [initial.id, initial.readyAt]);
  useEffect(() => {
    if (!restored) return;
    try {
      localStorage.setItem(storageKey(initial.id), JSON.stringify({ picked, touched, drafts } satisfies Saved));
    } catch {
      // Private mode or a full disk: the round still works, only a reload forgets.
    }
  }, [restored, initial.id, picked, touched, drafts]);

  const rows = useMemo(() => pickList(initial.lines), [initial.lines]);
  const totalTake = rows.reduce((sum, row) => sum + row.take, 0);
  const totalPicked = rows.reduce((sum, row) => sum + Math.min(row.take, picked[row.key] ?? 0), 0);
  const prepared = useMemo(() => allocate(initial.lines, picked), [initial.lines, picked]);

  // Save the box now and then, so another phone can take over.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function setPicks(change: (current: Record<string, number>) => Record<string, number>) {
    setTouched(true);
    setPicked((current) => {
      const next = change(current);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void savePicked(initial.id, next).catch(() => undefined), 1200);
      return next;
    });
  }

  function draftFor(machineId: string) {
    return drafts[machineId] ?? emptyDraft();
  }
  function updateDraft(machineId: string, change: (draft: StopDraft) => StopDraft) {
    setDrafts((all) => ({ ...all, [machineId]: change(all[machineId] ?? emptyDraft()) }));
  }
  function updateLine(machineId: string, selection: string, change: (line: LineDraft) => LineDraft) {
    updateDraft(machineId, (draft) => ({
      ...draft,
      lines: { ...draft.lines, [selection]: change(draft.lines[selection] ?? emptyLine()) },
    }));
  }

  function run(action: () => Promise<void>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        after?.();
      } catch {
        setError(t.failed);
      }
    });
  }

  function applyReport(machineId: string, kind: ReportKind, selection: string | null, value: number, note: string | null) {
    if (kind === "technical") {
      updateDraft(machineId, (d) => ({ ...d, technical: true, note: note || d.note }));
      return;
    }
    if (!selection) return;
    if (kind === "count") {
      updateLine(machineId, selection, (line) => ({ ...line, countAfter: value }));
      return;
    }
    updateLine(machineId, selection, (line) => ({
      ...line,
      removed: [...line.removed.filter((r) => r.reason !== kind), ...(value > 0 ? [{ reason: kind, qty: value }] : [])],
    }));
  }

  /**
   * The stop's lines as they will be written. A slot ticked off took what was
   * set aside for it, or the number typed; one left open took nothing, unless
   * the filler says it was filled after all.
   */
  function stopInput(machineId: string, open: "empty" | "planned"): StopInput {
    const draft = draftFor(machineId);
    const planned = initial.lines.filter((line) => line.machineId === machineId);
    const selections = new Set([...planned.map((line) => line.selection), ...Object.keys(draft.lines)]);
    return {
      checkedAt: draft.checkedAt,
      technical: draft.technical,
      note: draft.note,
      lines: [...selections].map((selection) => {
        const line = planned.find((l) => l.selection === selection);
        const edit = draft.lines[selection] ?? emptyLine();
        const prep = prepared[slotKey(machineId, selection)] ?? 0;
        return {
          selection,
          filled: edit.filled ?? (line && open === "planned" ? prep : 0),
          removed: edit.removed,
          countAfter: edit.countAfter,
          full: edit.full,
        };
      }),
    };
  }

  // The three-second window to take a finished machine back.
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      const job = pendingStop.current;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the countdown ends here, once
      setCountdown(null);
      if (!job) return;
      pendingStop.current = null;
      run(
        () => completeStop(initial.id, job.machineId, job.input),
        () => {
          setStops((all) => ({
            ...all,
            [job.machineId]: {
              checkedAt: job.input.checkedAt,
              completedAt: new Date().toISOString(),
              skipped: false,
              technical: job.input.technical,
              note: job.input.note,
              lines: job.input.lines.map((line) => ({
                ...line,
                prepared: prepared[slotKey(job.machineId, line.selection)] ?? 0,
                removed: line.removed as { reason: RemovalReason; qty: number }[],
              })),
            },
          }));
          setPendingId(null);
          router.refresh();
        },
      );
      return;
    }
    const timer = setTimeout(() => setCountdown((n) => (n === null ? null : n - 1)), 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown]);

  const isDone = (machineId: string) => Boolean(stops[machineId]?.completedAt) || pendingId === machineId;
  const openStops = initial.machines.filter((mc) => !isDone(mc.id));
  const nextStop = openStops[0] ?? null;

  function openStop(machineId: string) {
    // Opening a machine is arriving at it: that moment is kept for the timings.
    updateDraft(machineId, (d) => ({ ...d, checkedAt: d.checkedAt ?? new Date().toISOString() }));
    if (countdown !== null) setCountdown(0);
    setStopId(machineId);
    setSkipArmed(false);
    setView("stop");
  }

  function finishStop(machineId: string, open: "empty" | "planned") {
    pendingStop.current = { machineId, input: stopInput(machineId, open) };
    setPendingId(machineId);
    setUnchecked(null);
    setView("home");
    setCountdown(3);
  }

  function undoFinish() {
    const job = pendingStop.current;
    pendingStop.current = null;
    setCountdown(null);
    setPendingId(null);
    if (job) {
      setStopId(job.machineId);
      setView("stop");
    }
  }

  function start() {
    run(
      () => startRound(initial.id, picked),
      () => {
        setReadyAt(new Date().toISOString());
        setShowShort(false);
        setView("home");
      },
    );
  }

  const header = (back?: () => void) => (
    <div className="flex min-h-11 items-center justify-between gap-3">
      {back ? (
        <button type="button" onClick={back} className="-ml-2 flex h-11 items-center gap-1 rounded-full px-2 text-[15px] font-semibold">
          <ChevronLeft className="size-5" />
          {t.backToRound}
        </button>
      ) : (
        <VendlyWordmark className="h-[24px] w-auto text-[#2a2520]" />
      )}
      {error ? (
        <span className="text-[13px] font-semibold text-negative">{error}</span>
      ) : (
        readyAt && !completed && back && <RoundClock since={readyAt} />
      )}
    </div>
  );

  // ——— The round is closed ———
  if (completed) {
    const back = returnsFor(initial.lines, initial.slots, picked, stops);
    const filled = Object.values(stops).reduce((sum, stop) => sum + stop.lines.reduce((s, l) => s + l.filled, 0), 0);
    const removed = back.filter((r) => r.source === "removed").reduce((sum, r) => sum + r.qty, 0);
    const leftover = back.filter((r) => r.source === "leftover").reduce((sum, r) => sum + r.qty, 0);
    return (
      <Screen>
        {header()}
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <span className="grid size-20 place-items-center rounded-full bg-foreground text-background">
            <Check className="size-9" strokeWidth={2.6} />
          </span>
          <h1 className="text-[36px] font-bold tracking-[-0.035em]">{t.thanks}</h1>
          <p className="text-[16px] text-muted-foreground">
            {fmt(t.thanksSummary, {
              machines: Object.values(stops).filter((stop) => !stop.skipped).length,
              filled,
              removed,
              back: leftover,
            })}
          </p>
          {readyAt && completedAt && (
            <p className="tabular text-[16px] font-semibold">
              {fmt(t.took, {
                time: duration(
                  (new Date(completedAt).getTime() - new Date(readyAt).getTime()) / 60000,
                  m.refill.runTime,
                  m.refill.runTimeHours,
                ),
              })}
            </p>
          )}
        </div>
      </Screen>
    );
  }

  // ——— Bring back and close ———
  if (view === "returns" && readyAt && openStops.length === 0 && countdown === null) {
    return (
      <ReturnsScreen
        rows={returnsFor(initial.lines, initial.slots, picked, stops)}
        busy={pending}
        header={header(() => setView("home"))}
        visited={Object.values(stops).filter((stop) => !stop.skipped).length}
        skipped={Object.values(stops).filter((stop) => stop.skipped).length}
        onFinish={(choices) =>
          run(
            () => completeRound(initial.id, choices),
            () => {
              setCompleted(true);
              setCompletedAt(new Date().toISOString());
              try {
                localStorage.removeItem(storageKey(initial.id));
              } catch {
                // Nothing to clean up then.
              }
              router.refresh();
            },
          )
        }
      />
    );
  }

  // ——— Packing ———
  if (view === "pick" && !readyAt) {
    const shortRows = rows.filter((row) => (picked[row.key] ?? 0) < row.take);
    const shortTotal = shortRows.reduce((sum, row) => sum + row.take - (picked[row.key] ?? 0), 0);
    const countRow = rows.find((row) => row.key === countSheet) ?? null;
    return (
      <Screen padded={false}>
        <div className="flex flex-col gap-3 px-4 pt-4">
          {header(() => setView("home"))}
          <div className="flex items-baseline justify-between">
            <h1 className="text-[30px] font-bold tracking-[-0.03em]">{t.pickTitle}</h1>
            <span className="tabular text-[22px] font-bold tracking-[-0.02em]">
              {totalPicked} <span className="text-muted-foreground">/ {totalTake}</span>
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface" aria-hidden="true">
            <div
              className="h-full rounded-full bg-foreground transition-[width] duration-300"
              style={{ width: `${totalTake ? Math.round((totalPicked / totalTake) * 100) : 0}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-[14.5px] text-muted-foreground">{t.pickHint}</p>
            <button
              type="button"
              className="h-10 rounded-full px-3 text-[14.5px] font-semibold"
              onClick={() => setPicks(() => Object.fromEntries(rows.map((row) => [row.key, row.take])))}
            >
              {t.checkAll}
            </button>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 pb-36 pt-1">
          {initial.machines.map((machine) => {
            const machineRows = rows.filter((row) => row.machineId === machine.id);
            if (machineRows.length === 0) return null;
            return (
              <section key={machine.id} className="flex flex-col gap-2">
                <p className="px-2 text-[14px] font-semibold text-muted-foreground">{machine.name}</p>
                <ul className="surface-card flex flex-col px-2 py-1">
                  {machineRows.map((row) => {
                    const n = Math.min(row.take, picked[row.key] ?? 0);
                    const done = n >= row.take;
                    return (
                      <li key={row.key} className="flex items-center gap-1 border-b border-border/60 last:border-0">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={done}
                          onClick={() => setPicks((current) => ({ ...current, [row.key]: done ? 0 : row.take }))}
                          className="flex min-h-[68px] min-w-0 flex-1 items-center gap-3 px-1 text-left"
                        >
                          <Tick done={done} />
                          <span className={cn("min-w-0 flex-1 truncate text-[16px] font-semibold", done && "text-muted-foreground line-through")}>
                            {row.productName}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setCountSheet(row.key)}
                          className={cn(
                            "tabular h-11 min-w-16 rounded-xl px-3 text-[17px] font-bold",
                            n > 0 && !done ? "bg-warning/15 text-foreground" : "bg-surface",
                          )}
                          aria-label={fmt(t.howManyOf, { product: row.productName })}
                        >
                          {n > 0 && !done ? `${n}/${row.take}` : `×${row.take}`}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>

        <BottomBar>
          <button
            type="button"
            className={primary}
            disabled={pending || totalPicked === 0}
            onClick={() => (shortTotal > 0 ? setShowShort(true) : start())}
          >
            {pending ? t.sending : t.start}
          </button>
        </BottomBar>

        {countRow && (
          <CountSheet
            title={countRow.productName}
            max={countRow.take}
            value={Math.min(countRow.take, picked[countRow.key] ?? 0)}
            onClose={() => setCountSheet(null)}
            onSave={(value) => {
              setPicks((current) => ({ ...current, [countRow.key]: value }));
              setCountSheet(null);
            }}
          />
        )}
        {showShort && (
          <Sheet onClose={() => setShowShort(false)}>
            <h2 className="text-[24px] font-bold tracking-[-0.025em]">{t.readyTitle}</h2>
            <div className="flex gap-3 rounded-2xl bg-warning/10 p-3.5">
              <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning" />
              <p className="text-[14.5px]">
                <b>
                  {fmt(t.short, {
                    n: shortTotal,
                    products: shortRows.map((row) => row.productName).slice(0, 3).join(", "),
                  })}
                </b>{" "}
                <span className="text-muted-foreground">{t.shortHint}</span>
              </p>
            </div>
            <button type="button" className={primary} disabled={pending} onClick={start}>
              {pending ? t.sending : t.start}
            </button>
            <button type="button" className={ghost} onClick={() => setShowShort(false)}>
              {t.keepPicking}
            </button>
          </Sheet>
        )}
      </Screen>
    );
  }

  // ——— At a machine ———
  const current = view === "stop" && stopId && !isDone(stopId) ? initial.machines.find((mc) => mc.id === stopId) ?? null : null;
  if (current && readyAt) {
    const draft = draftFor(current.id);
    const planned = initial.lines.filter((line) => line.machineId === current.id);
    const machineSlots = initial.slots.filter((slot) => slot.machineId === current.id);
    const stopIndex = initial.machines.findIndex((mc) => mc.id === current.id) + 1;
    const open = planned.filter((line) => draft.lines[line.selection]?.filled === undefined);
    const removedHere = Object.values(draft.lines).reduce((sum, l) => sum + l.removed.reduce((s, r) => s + r.qty, 0), 0);
    const tickAll = () =>
      updateDraft(current.id, (d) => ({
        ...d,
        lines: Object.fromEntries([
          ...Object.entries(d.lines),
          ...planned
            .filter((line) => d.lines[line.selection]?.filled === undefined)
            .map((line) => [
              line.selection,
              { ...(d.lines[line.selection] ?? emptyLine()), filled: prepared[slotKey(current.id, line.selection)] ?? 0 },
            ]),
        ]),
      }));

    return (
      <Screen padded={false}>
        <div className="flex flex-col gap-2 px-4 pt-4">
          {header(() => setView("home"))}
          <p className="mt-1 text-[14px] font-semibold text-muted-foreground">
            {fmt(t.stopOf, { n: stopIndex, total: initial.machines.length })}
          </p>
          <h1 className="text-[30px] font-bold leading-tight tracking-[-0.03em]">{current.name}</h1>
          <p className="flex items-center gap-2 text-[14px]">
            <span
              className={cn(
                "size-2.5 rounded-full",
                current.status === "online" ? "bg-positive" : current.status === "offline" ? "bg-warning" : "bg-muted-foreground",
              )}
            />
            <b>{current.status === "online" ? t.online : current.status === "offline" ? t.offline : t.unknownStatus}</b>
            {current.lastSale && <span className="text-muted-foreground">· {fmt(t.lastSale, { when: f.relative(current.lastSale) })}</span>}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={chip} onClick={() => setReport({ selection: null })}>
              <TriangleAlert className="size-4 text-warning" />
              {t.reportShort}
            </button>
            <button
              type="button"
              className={cn(chip, skipArmed && "bg-foreground text-background ring-foreground")}
              disabled={pending}
              onClick={() => {
                if (!skipArmed) return setSkipArmed(true);
                run(
                  () => skipStop(initial.id, current.id),
                  () => {
                    setStops((all) => ({
                      ...all,
                      [current.id]: { checkedAt: null, completedAt: new Date().toISOString(), skipped: true, technical: false, note: null, lines: [] },
                    }));
                    setView("home");
                  },
                );
              }}
            >
              {skipArmed ? t.skipConfirm : t.skipShort}
            </button>
            {removedHere > 0 && <span className={cn(chip, "ring-warning/40")}>{fmt(t.removedBadge, { n: removedHere })}</span>}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-[14.5px] text-muted-foreground">{t.fillHint}</p>
            {open.length > 0 && (
              <button type="button" className="h-10 rounded-full px-3 text-[14.5px] font-semibold" onClick={tickAll}>
                {t.checkAll}
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 pb-36 pt-1">
          <ul className="surface-card flex flex-col px-2 py-1">
            {planned.map((line) => {
              const key = slotKey(current.id, line.selection);
              const prep = prepared[key] ?? 0;
              const edit = draft.lines[line.selection];
              const done = edit?.filled !== undefined;
              const filled = edit?.filled ?? prep;
              const shortHere = line.take - prep;
              return (
                <li key={key} className="flex items-center gap-1 border-b border-border/60 last:border-0">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={done}
                    onClick={() =>
                      updateLine(current.id, line.selection, (l) => ({ ...l, filled: done ? undefined : prep }))
                    }
                    className="flex min-h-[72px] min-w-0 flex-1 items-center gap-3 px-1 py-2 text-left"
                  >
                    <Tick done={done} />
                    <span className="min-w-8 rounded-lg bg-surface px-1.5 py-1 text-center font-mono text-[12.5px] font-semibold">
                      {line.selection}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className={cn("truncate text-[15.5px] font-semibold", done && "text-muted-foreground")}>
                        {line.productName}
                      </span>
                      <span className={cn("text-[13px]", shortHere > 0 ? "font-semibold text-warning" : "text-muted-foreground")}>
                        {shortHere > 0
                          ? fmt(t.shortHere, { n: shortHere })
                          : line.stock === null
                            ? t.notCounted
                            : fmt(t.nowOf, { n: line.stock, cap: line.capacity })}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLineSheet(line.selection)}
                    className={cn(
                      "tabular h-11 min-w-14 rounded-xl px-3 text-[18px] font-bold",
                      done && filled !== prep ? "bg-warning/15" : "bg-surface",
                    )}
                    aria-label={fmt(t.howManyIn, { slot: line.selection })}
                  >
                    +{filled}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <BottomBar>
          <button
            type="button"
            className={primary}
            onClick={() => (open.length > 0 ? setUnchecked(open.length) : finishStop(current.id, "planned"))}
          >
            {fmt(t.doneWith, { machine: current.name })}
          </button>
        </BottomBar>

        {unchecked !== null && (
          <Sheet onClose={() => setUnchecked(null)}>
            <h2 className="text-[22px] font-bold tracking-[-0.02em]">{fmt(t.uncheckedTitle, { n: unchecked })}</h2>
            <p className="text-[15.5px] text-muted-foreground">{t.uncheckedHint}</p>
            <button type="button" className={primary} onClick={() => finishStop(current.id, "planned")}>
              {t.allFilledAnyway}
            </button>
            <button type="button" className={outline} onClick={() => finishStop(current.id, "empty")}>
              {t.notFilled}
            </button>
            <button type="button" className={ghost} onClick={() => setUnchecked(null)}>
              {t.back}
            </button>
          </Sheet>
        )}
        {lineSheet &&
          (() => {
            const line = planned.find((l) => l.selection === lineSheet)!;
            const prep = prepared[slotKey(current.id, line.selection)] ?? 0;
            return (
              <LineSheet
                title={`${line.selection} · ${line.productName}`}
                prepared={prep}
                capacity={line.capacity}
                value={draft.lines[line.selection]?.filled ?? prep}
                onClose={() => setLineSheet(null)}
                onSave={(value) => {
                  updateLine(current.id, line.selection, (l) => ({ ...l, filled: value }));
                  setLineSheet(null);
                }}
                onOther={() => {
                  setLineSheet(null);
                  setReport({ selection: line.selection });
                }}
              />
            );
          })()}
        {report && (
          <ReportSheet
            slots={machineSlots}
            preset={report.selection}
            onClose={() => setReport(null)}
            onSave={(kind, selection, value, note) => {
              applyReport(current.id, kind, selection, value, note);
              setReport(null);
            }}
          />
        )}
      </Screen>
    );
  }

  // ——— The round as a checklist ———
  const pendingMachine = initial.machines.find((mc) => mc.id === pendingId) ?? null;
  const pieces = (machineId: string) =>
    initial.lines
      .filter((line) => line.machineId === machineId)
      .reduce((sum, line) => sum + (readyAt ? (prepared[slotKey(machineId, line.selection)] ?? 0) : line.take), 0);
  const steps: {
    key: string;
    title: string;
    sub: string;
    state: "done" | "now" | "later" | "skipped";
    aside?: string;
    onOpen?: () => void;
  }[] = [
    {
      key: "pick",
      title: t.pickTitle,
      sub: readyAt ? fmt(t.stepPickDone, { n: totalPicked }) : fmt(t.stepPickSub, { n: totalTake }),
      state: readyAt ? "done" : "now",
      onOpen: readyAt ? undefined : () => setView("pick"),
    },
    ...initial.machines.map((machine) => {
      const record = stops[machine.id];
      const done = isDone(machine.id);
      const slotsHere = initial.lines.filter((line) => line.machineId === machine.id).length;
      return {
        key: machine.id,
        title: machine.name,
        sub: fmt(t.stopSub, { slots: slotsHere, n: pieces(machine.id) }),
        state: (record?.skipped
          ? "skipped"
          : done
            ? "done"
            : readyAt && machine.id === nextStop?.id
              ? "now"
              : "later") as "done" | "now" | "later" | "skipped",
        aside: record?.skipped
          ? t.skipped
          : record?.completedAt
            ? fmt(t.doneAt, { time: f.time(record.completedAt) })
            : undefined,
        onOpen: readyAt && !done ? () => openStop(machine.id) : undefined,
      };
    }),
    {
      key: "finish",
      title: t.stepFinish,
      sub: t.stepFinishSub,
      state: readyAt && openStops.length === 0 && countdown === null ? "now" : "later",
      onOpen: readyAt && openStops.length === 0 && countdown === null ? () => setView("returns") : undefined,
    },
  ];

  return (
    <Screen padded={false}>
      <div className="flex flex-col gap-1 px-4 pt-4">
        {header()}
        <p className="mt-3 text-[13.5px] text-muted-foreground">
          {fmt(t.roundOf, { date: f.dayMonth(initial.createdAt), count: initial.machines.length })}
        </p>
        <h1 className="text-[30px] font-bold tracking-[-0.03em]">{t.myRound}</h1>
        {readyAt && <BigClock since={readyAt} startedLabel={fmt(t.running, { time: f.time(readyAt) })} />}
      </div>

      <ol className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 pb-44 pt-4">
        {steps.map((step, index) => (
          <li key={step.key}>
            <button
              type="button"
              disabled={!step.onOpen}
              onClick={step.onOpen}
              className={cn(
                "flex min-h-[76px] w-full items-center gap-3.5 rounded-2xl px-4 py-3 text-left transition-colors",
                step.state === "now" ? "bg-card shadow-[0_0_0_2px_var(--foreground)]" : "bg-card/70",
                step.state === "later" && "opacity-60",
              )}
            >
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-full text-[15px] font-bold",
                  step.state === "done" && "bg-positive text-background",
                  step.state === "skipped" && "bg-warning/20 text-foreground",
                  step.state === "now" && "bg-foreground text-background",
                  step.state === "later" && "bg-surface text-muted-foreground",
                )}
              >
                {step.state === "done" ? <Check className="size-5" strokeWidth={3} /> : index + 1}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={cn("truncate text-[16.5px] font-semibold", step.state === "done" && "text-muted-foreground")}>
                  {step.title}
                </span>
                <span className="truncate text-[13.5px] text-muted-foreground">{step.sub}</span>
              </span>
              {step.aside ? (
                <span className="shrink-0 text-[13px] font-semibold text-muted-foreground">{step.aside}</span>
              ) : step.state === "now" ? (
                <span className="shrink-0 rounded-full bg-foreground px-2.5 py-1 text-[12px] font-bold text-background">{t.now}</span>
              ) : step.onOpen ? (
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
              ) : null}
            </button>
          </li>
        ))}
      </ol>

      <BottomBar>
        {pendingMachine && countdown !== null && (
          <div className="mb-1.5 flex items-center justify-between gap-3 rounded-2xl bg-positive/12 px-4 py-2.5">
            <span className="flex items-center gap-2 text-[15px] font-semibold">
              <Check className="size-5 text-positive" strokeWidth={3} />
              {fmt(t.stopDoneToast, { machine: pendingMachine.name })}
            </span>
            <button type="button" className="h-9 rounded-full px-3 text-[14px] font-semibold underline" onClick={undoFinish}>
              {t.undo}
            </button>
          </div>
        )}
        {!readyAt ? (
          <button type="button" className={primary} onClick={() => setView("pick")}>
            {touched ? t.continuePicking : t.beginPicking}
          </button>
        ) : nextStop ? (
          <button type="button" className={primary} disabled={pending} onClick={() => openStop(nextStop.id)}>
            {fmt(t.goTo, { machine: nextStop.name })}
            <ChevronRight className="size-5" />
          </button>
        ) : (
          <button
            type="button"
            className={primary}
            disabled={pending}
            onClick={() => {
              if (countdown !== null) setCountdown(0);
              setView("returns");
            }}
          >
            {pending ? t.sending : t.finish}
          </button>
        )}
      </BottomBar>
    </Screen>
  );
}

/** A round checkbox, big enough for a thumb in a cold van. */
function Tick({ done }: { done: boolean }) {
  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full border-2 transition-colors",
        done ? "border-positive bg-positive text-background" : "border-border bg-card",
      )}
      aria-hidden="true"
    >
      {done && <Check className="size-[18px]" strokeWidth={3.2} />}
    </span>
  );
}

/** The round's own clock, big on its overview: it runs from "Start ronde" on, by itself. */
function BigClock({ since, startedLabel }: { since: string; startedLabel: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const every = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, []);
  const seconds = now === null ? 0 : Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  const h = Math.floor(seconds / 3600);
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return (
    <div className="mt-3 flex items-center gap-3 rounded-2xl bg-foreground px-4 py-3 text-background">
      <Timer className="size-6 shrink-0" strokeWidth={2.2} aria-hidden="true" />
      <span className="tabular text-[34px] font-bold leading-none tracking-[-0.03em]">{now === null ? "–:––" : `${h}:${mm}:${ss}`}</span>
      <span className="ml-auto text-right text-[13px] font-medium opacity-80">{startedLabel}</span>
    </div>
  );
}

/** How many of one product went into the box, when it was not all of them. */
function CountSheet({
  title,
  max,
  value,
  onClose,
  onSave,
}: {
  title: string;
  max: number;
  value: number;
  onClose: () => void;
  onSave: (value: number) => void;
}) {
  const { m } = useI18n();
  const t = m.round;
  const [n, setN] = useState(value);
  return (
    <Sheet onClose={onClose}>
      <h2 className="text-[22px] font-bold tracking-[-0.02em]">{title}</h2>
      <p className="text-[16px] text-muted-foreground">{fmt(t.howManyTake, { n: max })}</p>
      <div className="flex items-center justify-center gap-6 py-2">
        <button type="button" aria-label={t.less} className={cn(stepper, "size-16 text-3xl")} disabled={n === 0} onClick={() => setN(n - 1)}>
          −
        </button>
        <span className="tabular w-12 text-center text-[48px] font-bold tracking-[-0.03em]">{n}</span>
        <button type="button" aria-label={t.more} className={cn(stepper, "size-16 text-3xl")} disabled={n >= max} onClick={() => setN(n + 1)}>
          +
        </button>
      </div>
      <button type="button" className={primary} onClick={() => onSave(n)}>
        {t.save}
      </button>
    </Sheet>
  );
}

function ReturnsScreen({
  rows,
  busy,
  header,
  onFinish,
  visited,
  skipped,
}: {
  rows: ReturnRow[];
  busy: boolean;
  header: React.ReactNode;
  onFinish: (choices: { productId: string; source: "leftover" | "removed"; reason: string | null; disposition: string }[]) => void;
  visited: number;
  skipped: number;
}) {
  const { m } = useI18n();
  const t = m.round;
  const [choice, setChoice] = useState<Record<string, Disposition>>({});
  const keyOf = (row: ReturnRow) => `${row.productId}|${row.source}|${row.reason ?? ""}`;
  const label: Record<Disposition, string> = {
    stock: t.dispStock,
    waste: t.dispWaste,
    promo: t.dispPromo,
    staff: t.dispStaff,
    other: t.dispOther,
  };
  const reasonLabel: Record<RemovalReason, string> = {
    expired: t.reasonExpired,
    damaged: t.reasonDamaged,
    nearExpiry: t.reasonNear,
    other: t.reasonOther,
  };
  const leftover = rows.filter((row) => row.source === "leftover");
  const removed = rows.filter((row) => row.source === "removed");

  const list = (items: ReturnRow[]) => (
    <ul className="surface-card flex flex-col px-3 py-1">
      {items.map((row) => (
        <li key={keyOf(row)} className="flex min-h-16 items-center gap-3 border-b border-border/60 last:border-0">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[15px] font-semibold">{row.productName}</span>
            {row.reason && <span className="text-[13px] text-muted-foreground">{reasonLabel[row.reason]}</span>}
          </span>
          <span className="tabular w-6 text-right text-[17px] font-bold">{row.qty}</span>
          <select
            aria-label={row.productName}
            className="h-10 max-w-[44%] rounded-xl bg-surface px-2 text-[13.5px] font-semibold"
            value={choice[keyOf(row)] ?? row.disposition}
            onChange={(event) => setChoice((all) => ({ ...all, [keyOf(row)]: event.target.value as Disposition }))}
          >
            {(Object.keys(label) as Disposition[]).map((option) => (
              <option key={option} value={option}>
                {label[option]}
              </option>
            ))}
          </select>
        </li>
      ))}
    </ul>
  );

  return (
    <Screen padded={false}>
      <div className="flex flex-col gap-3 px-4 pt-4">
        {header}
        <h1 className="mt-2 text-[32px] font-bold tracking-[-0.03em]">{t.roundDone}</h1>
        <p className="text-[14px] text-muted-foreground">{skipped ? fmt(t.machinesDoneSkipped, { n: visited, skipped }) : fmt(t.machinesDone, { n: visited })}</p>
      </div>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 pb-36 pt-4">
        {rows.length === 0 && <p className="surface-card p-5 text-[15px]">{t.nothingBack}</p>}
        {leftover.length > 0 && (
          <>
            <p className="px-2 text-[16px] font-semibold">{t.stillWithYou}</p>
            {list(leftover)}
          </>
        )}
        {removed.length > 0 && (
          <>
            <p className="mt-2 px-2 text-[16px] font-semibold">{t.removedFromMachine}</p>
            {list(removed)}
          </>
        )}
      </div>
      <BottomBar>
        <button
          type="button"
          className={primary}
          disabled={busy}
          onClick={() =>
            onFinish(
              rows.map((row) => ({
                productId: row.productId,
                source: row.source,
                reason: row.reason,
                disposition: choice[keyOf(row)] ?? row.disposition,
              })),
            )
          }
        >
          {busy ? t.sending : t.finish}
        </button>
      </BottomBar>
    </Screen>
  );
}

/**
 * How long the round has been going, from "Start ronde" on. It runs by itself:
 * a timer the filler has to start and stop gets forgotten, and then the
 * number is worse than none.
 */
function RoundClock({ since }: { since: string }) {
  const { m } = useI18n();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const every = setInterval(tick, 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, []);
  if (now === null) return null;
  const minutes = (now - new Date(since).getTime()) / 60000;
  return (
    <span
      className="tabular flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-[13.5px] font-semibold"
      aria-label={fmt(m.round.clockLabel, { time: duration(minutes, m.refill.runTime, m.refill.runTimeHours) })}
    >
      <Timer className="size-4" strokeWidth={2.2} aria-hidden="true" />
      {duration(minutes, m.refill.runTime, m.refill.runTimeHours)}
    </span>
  );
}

function Screen({ children, padded = true }: { children: React.ReactNode; padded?: boolean }) {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col bg-background">
      <div className={cn("flex flex-1 flex-col", padded && "px-4 pb-7 pt-4")}>{children}</div>
    </div>
  );
}

function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-md flex-col gap-1.5 px-4 pb-4 pt-3">{children}</div>
    </div>
  );
}

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-foreground/35" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[92svh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-[28px] bg-card px-5 pb-[calc(1.75rem+env(safe-area-inset-bottom))] pt-3"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="mx-auto h-1.5 w-10 rounded-full bg-border" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}

function LineSheet({
  title,
  prepared,
  capacity,
  value,
  onClose,
  onSave,
  onOther,
}: {
  title: string;
  prepared: number;
  capacity: number;
  value: number;
  onClose: () => void;
  onSave: (value: number) => void;
  onOther: () => void;
}) {
  const { m } = useI18n();
  const t = m.round;
  const [n, setN] = useState(value);
  return (
    <Sheet onClose={onClose}>
      <h2 className="text-[22px] font-bold tracking-[-0.02em]">{title}</h2>
      <p className="text-[16px] text-muted-foreground">{fmt(t.lineWithYou, { n: prepared })}</p>
      <div className="flex flex-col items-center gap-3 py-2">
        <p className="text-[15px] font-semibold">{t.lineFilled}</p>
        <div className="flex items-center gap-6">
          <button type="button" aria-label={t.less} className={cn(stepper, "size-16 text-3xl")} disabled={n === 0} onClick={() => setN(n - 1)}>
            −
          </button>
          <span className="tabular w-12 text-center text-[48px] font-bold tracking-[-0.03em]">{n}</span>
          <button
            type="button"
            aria-label={t.more}
            className={cn(stepper, "size-16 text-3xl")}
            disabled={n >= capacity}
            onClick={() => setN(n + 1)}
          >
            +
          </button>
        </div>
        {prepared - n > 0 && <p className="text-[15px] text-muted-foreground">{fmt(t.lineBack, { n: prepared - n })}</p>}
      </div>
      <button type="button" className={primary} onClick={() => onSave(n)}>
        {t.save}
      </button>
      <button type="button" className={ghost} onClick={onOther}>
        {t.lineOther}
      </button>
    </Sheet>
  );
}

function ReportSheet({
  slots,
  preset,
  onClose,
  onSave,
}: {
  slots: RefillRound["slots"];
  preset: string | null;
  onClose: () => void;
  onSave: (kind: ReportKind, selection: string | null, value: number, note: string | null) => void;
}) {
  const { m } = useI18n();
  const t = m.round;
  const [kind, setKind] = useState<ReportKind>("expired");
  const [selection, setSelection] = useState<string | null>(preset);
  const [value, setValue] = useState(1);
  const [note, setNote] = useState("");
  const slot = slots.find((s) => s.selection === selection) ?? null;
  const kinds: { id: ReportKind; label: string }[] = [
    { id: "expired", label: t.reasonExpired },
    { id: "damaged", label: t.reasonDamaged },
    { id: "nearExpiry", label: t.reasonNear },
    { id: "other", label: t.reasonOther },
    { id: "count", label: t.reasonCount },
    { id: "technical", label: t.reasonTechnical },
  ];
  const ready = kind === "technical" || selection !== null;

  return (
    <Sheet onClose={onClose}>
      <h2 className="text-[22px] font-bold tracking-[-0.02em]">{t.whatIsIt}</h2>
      <div className="flex flex-wrap gap-2">
        {kinds.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={kind === option.id}
            onClick={() => {
              setKind(option.id);
              setValue(option.id === "count" ? 0 : 1);
            }}
            className={cn(
              "h-11 rounded-full px-4 text-[14.5px] font-semibold",
              kind === option.id ? "bg-foreground text-background" : "bg-surface",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {kind === "technical" ? (
        <label className="flex flex-col gap-1.5 text-[14px] font-semibold">
          {t.technicalNote}
          <input
            className="h-12 rounded-xl border border-input bg-card px-3 text-[16px] font-normal"
            maxLength={80}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
      ) : (
        <>
          <p className="text-[14px] font-semibold text-muted-foreground">{t.whichSlot}</p>
          <ul className="flex max-h-64 flex-col overflow-y-auto rounded-2xl border border-border">
            {slots.map((s) => (
              <li key={s.selection}>
                <button
                  type="button"
                  aria-pressed={selection === s.selection}
                  onClick={() => setSelection(s.selection)}
                  className={cn(
                    "flex min-h-16 w-full items-center gap-3 border-b border-border/60 px-3.5 text-left last:border-0",
                    selection === s.selection ? "bg-surface" : "bg-card",
                  )}
                >
                  <span
                    className={cn(
                      "rounded-lg px-1.5 py-1 font-mono text-[12.5px] font-semibold",
                      selection === s.selection ? "bg-foreground text-background" : "bg-surface",
                    )}
                  >
                    {s.selection}
                  </span>
                  <span className="flex-1 text-[15px] font-semibold">{s.productName ?? "—"}</span>
                  {selection === s.selection && <Check className="size-5" />}
                </button>
              </li>
            ))}
          </ul>
          {slot && (
            <div className="flex items-center justify-between rounded-2xl bg-surface px-4 py-3">
              <span className="text-[15px] font-semibold">{kind === "count" ? t.howManyNow : t.takenOut}</span>
              <div className="flex items-center gap-2">
                <button type="button" aria-label={t.less} className={cn(stepper, "bg-card")} disabled={value <= 0} onClick={() => setValue(value - 1)}>
                  −
                </button>
                <span className="tabular w-8 text-center text-[22px] font-bold">{value}</span>
                <button
                  type="button"
                  aria-label={t.more}
                  className={cn(stepper, "bg-card")}
                  disabled={value >= slot.capacity}
                  onClick={() => setValue(value + 1)}
                >
                  +
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <button
        type="button"
        className={primary}
        disabled={!ready}
        onClick={() => onSave(kind, selection, value, note.trim() || null)}
      >
        {t.save}
      </button>
      <button type="button" className={ghost} onClick={onClose}>
        {t.cancel}
      </button>
    </Sheet>
  );
}
