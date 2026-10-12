"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Timer, TriangleAlert } from "lucide-react";
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

// One screen at a time, one big button that is right on most visits, and the
// person only says what went differently. Progress is kept on the phone too,
// so a reload in a basement does not lose the box.

type LineDraft = {
  filled?: number;
  removed: { reason: RemovalReason; qty: number }[];
  countAfter: number | null;
  full: boolean;
};
type StopDraft = {
  checkedAt: string | null;
  technical: boolean;
  note: string | null;
  allFull: boolean | null;
  lines: Record<string, LineDraft>;
};
type Saved = { picked: Record<string, number>; touched: boolean; drafts: Record<string, StopDraft> };
type ReportKind = RemovalReason | "count" | "technical";

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
  function setPick(key: string, value: number) {
    setTouched(true);
    setPicked((current) => {
      const next = { ...current, [key]: value };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void savePicked(initial.id, next).catch(() => undefined), 1200);
      return next;
    });
  }
  function takeAll() {
    const all = Object.fromEntries(rows.map((row) => [row.key, row.take]));
    setTouched(true);
    setPicked(all);
    return all;
  }

  const [showReady, setShowReady] = useState(false);
  const openStops = initial.machines.filter((mc) => !stops[mc.id]?.completedAt);
  const current = openStops[0] ?? null;
  const stopIndex = current ? initial.machines.findIndex((mc) => mc.id === current.id) + 1 : 0;

  const [phase, setPhase] = useState<"check" | "fill" | "done">("check");
  const [report, setReport] = useState<{ selection: string | null } | null>(null);
  const [lineSheet, setLineSheet] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [doneSummary, setDoneSummary] = useState<{ filled: number; removed: number; back: number } | null>(null);
  const pendingStop = useRef<{ machineId: string; input: StopInput } | null>(null);

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

  // The stop's lines as they will be written: the plan unless told otherwise.
  function stopInput(machineId: string): StopInput {
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
          filled: edit.filled ?? (line ? prep : 0),
          removed: edit.removed,
          countAfter: edit.countAfter,
          full: edit.full || (draft.allFull === true && Boolean(line) && line!.stock === null),
        };
      }),
    };
  }

  // The three-second window to take "everything filled" back.
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
          setPhase("check");
          setDoneSummary(null);
          router.refresh();
        },
      );
      return;
    }
    const timer = setTimeout(() => setCountdown((n) => (n === null ? null : n - 1)), 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown]);

  function finishStop(machineId: string) {
    const input = stopInput(machineId);
    const prep = initial.lines
      .filter((line) => line.machineId === machineId)
      .reduce((sum, line) => sum + (prepared[slotKey(machineId, line.selection)] ?? 0), 0);
    const filled = input.lines.reduce((sum, line) => sum + line.filled, 0);
    const removed = input.lines.reduce((sum, line) => sum + line.removed.reduce((s, r) => s + r.qty, 0), 0);
    setDoneSummary({ filled, removed, back: Math.max(0, prep - filled) });
    pendingStop.current = { machineId, input };
    setPhase("done");
    setCountdown(3);
  }

  const header = (
    <div className="flex items-center justify-between gap-3">
      <VendlyWordmark className="h-[24px] w-auto text-[#2a2520]" />
      {error ? (
        <span className="text-[13px] font-semibold text-negative">{error}</span>
      ) : (
        readyAt && !completed && <RoundClock since={readyAt} />
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
        {header}
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

  // ——— Picking ———
  if (!readyAt) {
    const shortRows = rows.filter((row) => (picked[row.key] ?? 0) < row.take);
    const shortTotal = shortRows.reduce((sum, row) => sum + row.take - (picked[row.key] ?? 0), 0);
    return (
      <Screen padded={false}>
        <div className="flex flex-col gap-3 px-4 pt-4">
          {header}
          <p className="text-[13px] text-muted-foreground">
            {fmt(t.roundOf, { date: f.dayMonth(initial.createdAt), count: initial.machines.length })}
          </p>
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
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 pb-36 pt-3">
          {initial.machines.map((machine) => {
            const machineRows = rows.filter((row) => row.machineId === machine.id);
            if (machineRows.length === 0) return null;
            const total = machineRows.reduce((sum, row) => sum + row.take, 0);
            return (
              <section key={machine.id} className="flex flex-col gap-2">
                <p className="px-2 text-[14px] font-semibold">
                  {machine.name} · {total}
                </p>
                <ul className="surface-card flex flex-col px-2 py-1">
                  {machineRows.map((row) => {
                    const n = Math.min(row.take, picked[row.key] ?? 0);
                    const done = n >= row.take;
                    return (
                      <li
                        key={row.key}
                        className={cn(
                          "flex min-h-[72px] items-center gap-2 border-b border-border/60 last:border-0",
                          done && "opacity-45",
                          "transition-opacity duration-200",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => !done && setPick(row.key, row.take)}
                          className="flex min-h-16 min-w-0 flex-1 items-center gap-3 px-1 text-left"
                        >
                          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-[14px] font-semibold">
                            {row.productName.charAt(0)}
                          </span>
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate text-[15px] font-semibold">{row.productName}</span>
                            <span className={cn("text-[13.5px] font-semibold", done ? "text-positive" : "text-foreground")}>
                              {done
                                ? fmt(t.picked, { n: row.take })
                                : n > 0
                                  ? `${fmt(t.take, { n: row.take })} · ${fmt(t.left, { n: row.take - n })}`
                                  : fmt(t.take, { n: row.take })}
                            </span>
                          </span>
                        </button>
                        <span className="w-3 shrink-0" aria-hidden="true" />
                        <button
                          type="button"
                          aria-label={t.less}
                          className={stepper}
                          disabled={n === 0}
                          onClick={() => setPick(row.key, Math.max(0, n - 1))}
                        >
                          −
                        </button>
                        <span className="tabular w-7 text-center text-[19px] font-bold">{n}</span>
                        <button
                          type="button"
                          aria-label={t.more}
                          className={stepper}
                          disabled={done}
                          onClick={() => setPick(row.key, Math.min(row.take, n + 1))}
                        >
                          +
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
          {touched ? (
            <button type="button" className={primary} onClick={() => setShowReady(true)}>
              {t.donePicking}
            </button>
          ) : (
            <button
              type="button"
              className={primary}
              onClick={() => {
                takeAll();
                setShowReady(true);
              }}
            >
              {t.allTaken}
            </button>
          )}
        </BottomBar>

        {showReady && (
          <Sheet onClose={() => setShowReady(false)}>
            <h2 className="text-[24px] font-bold tracking-[-0.025em]">{t.readyTitle}</h2>
            <p className="tabular text-[36px] font-bold leading-none tracking-[-0.035em]">
              {fmt(t.pieces, { n: totalPicked })}
            </p>
            <ol className="flex flex-col gap-2.5">
              {initial.machines.map((machine, index) => (
                <li key={machine.id} className="flex items-center gap-3 text-[16px]">
                  <span
                    className={cn(
                      "grid size-7 place-items-center rounded-full text-[13px] font-bold",
                      index === 0 ? "bg-foreground text-background" : "bg-surface",
                    )}
                  >
                    {index + 1}
                  </span>
                  <span className="font-semibold">{machine.name}</span>
                </li>
              ))}
            </ol>
            {shortTotal > 0 && (
              <div className="flex gap-3 rounded-2xl bg-warning/10 p-3.5">
                <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning" />
                <p className="text-[14px]">
                  <b>
                    {fmt(t.short, {
                      n: shortTotal,
                      products: shortRows.map((row) => row.productName).slice(0, 3).join(", "),
                    })}
                  </b>{" "}
                  <span className="text-muted-foreground">{t.shortHint}</span>
                </p>
              </div>
            )}
            <button
              type="button"
              className={primary}
              disabled={pending}
              onClick={() =>
                run(
                  () => startRound(initial.id, picked),
                  () => {
                    setReadyAt(new Date().toISOString());
                    setShowReady(false);
                    setPhase("check");
                  },
                )
              }
            >
              {pending ? t.sending : t.start}
            </button>
            <button type="button" className={ghost} onClick={() => setShowReady(false)}>
              {t.keepPicking}
            </button>
          </Sheet>
        )}
      </Screen>
    );
  }

  // ——— Every stop done: what comes back ———
  if (!current) {
    return (
      <ReturnsScreen
        rows={returnsFor(initial.lines, initial.slots, picked, stops)}
        busy={pending}
        header={header}
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

  // ——— At a machine ———
  const draft = draftFor(current.id);
  const planned = initial.lines.filter((line) => line.machineId === current.id);
  const withYou = planned.reduce((sum, line) => sum + (prepared[slotKey(current.id, line.selection)] ?? 0), 0);
  const machineSlots = initial.slots.filter((slot) => slot.machineId === current.id);
  const nextMachine = openStops[1] ?? null;

  if (phase === "done" && doneSummary) {
    return (
      <Screen>
        {header}
        <span className="mt-10 grid size-16 place-items-center rounded-full bg-positive/12 text-positive">
          <Check className="size-8" strokeWidth={2.6} />
        </span>
        <h1 className="mt-5 text-[32px] font-bold leading-tight tracking-[-0.03em]">
          {fmt(t.doneTitle, { machine: current.name })}
        </h1>
        <div className="surface-card mt-7 flex flex-col px-5 py-1">
          <SummaryRow label={t.filledCount} value={doneSummary.filled} big />
          <SummaryRow label={t.removedCount} value={doneSummary.removed} />
          <SummaryRow label={t.backCount} value={doneSummary.back} last />
        </div>
        <div className="flex-1" />
        <div className="flex flex-col gap-2.5">
          <button type="button" className={primary} disabled={pending} onClick={() => setCountdown(0)}>
            {pending ? t.sending : nextMachine ? fmt(t.next, { machine: nextMachine.name }) : t.toReturns}
          </button>
          {countdown !== null && countdown > 0 && (
            <>
              <button
                type="button"
                className={outline}
                onClick={() => {
                  pendingStop.current = null;
                  setCountdown(null);
                  setPhase("fill");
                }}
              >
                {t.undo}
              </button>
              <p className="text-center text-[13px] text-muted-foreground">{fmt(t.autoNext, { n: countdown })}</p>
            </>
          )}
        </div>
      </Screen>
    );
  }

  if (phase === "check") {
    return (
      <Screen>
        {header}
        <div className="mt-4 flex items-center justify-between">
          <span className="text-[14px] font-semibold text-muted-foreground">
            {fmt(t.stopOf, { n: stopIndex, total: initial.machines.length })}
          </span>
        </div>
        <div className="mt-1.5 flex gap-1.5" aria-hidden="true">
          {initial.machines.map((mc) => (
            <span
              key={mc.id}
              className={cn(
                "h-1 flex-1 rounded-full",
                stops[mc.id]?.completedAt || mc.id === current.id ? "bg-foreground" : "bg-border",
              )}
            />
          ))}
        </div>
        <h1 className="mt-7 text-[34px] font-bold leading-tight tracking-[-0.035em]">{current.name}</h1>
        <div className="surface-card mt-6 flex flex-col gap-3.5 p-5">
          <div>
            <p className="text-[13px] font-semibold text-muted-foreground">{t.withYouLabel}</p>
            <p className="tabular mt-1 text-[42px] font-bold leading-none tracking-[-0.04em]">
              {fmt(t.pieces, { n: withYou })}
            </p>
          </div>
          <p className="flex items-center gap-2 text-[14.5px]">
            <span
              className={cn(
                "size-2.5 rounded-full",
                current.status === "online" ? "bg-positive" : current.status === "offline" ? "bg-warning" : "bg-muted-foreground",
              )}
            />
            <b>{current.status === "online" ? t.online : current.status === "offline" ? t.offline : t.unknownStatus}</b>
            {current.lastSale && (
              <span className="text-muted-foreground">· {fmt(t.lastSale, { when: f.relative(current.lastSale) })}</span>
            )}
          </p>
        </div>
        <p className="mt-7 px-1 text-[17px] font-medium leading-snug">{t.checkHint}</p>
        <div className="flex-1" />
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            className={primary}
            onClick={() => {
              updateDraft(current.id, (d) => ({ ...d, checkedAt: d.checkedAt ?? new Date().toISOString() }));
              setPhase("fill");
            }}
          >
            {t.allGood}
          </button>
          <button
            type="button"
            className={outline}
            onClick={() => {
              updateDraft(current.id, (d) => ({ ...d, checkedAt: d.checkedAt ?? new Date().toISOString() }));
              setReport({ selection: null });
            }}
          >
            {t.report}
          </button>
          <button
            type="button"
            className={ghost}
            disabled={pending}
            onClick={() =>
              run(
                () => skipStop(initial.id, current.id),
                () =>
                  setStops((all) => ({
                    ...all,
                    [current.id]: { checkedAt: null, completedAt: new Date().toISOString(), skipped: true, technical: false, note: null, lines: [] },
                  })),
              )
            }
          >
            {t.skip}
          </button>
        </div>
        {report && (
          <ReportSheet
            slots={machineSlots}
            preset={report.selection}
            onClose={() => setReport(null)}
            onSave={(kind, selection, value, note) => {
              applyReport(current.id, kind, selection, value, note);
              setReport(null);
              setPhase("fill");
            }}
          />
        )}
      </Screen>
    );
  }

  // phase === "fill"
  const unknownLines = planned.filter((line) => line.stock === null);
  const goingIn = planned.reduce((sum, line) => {
    const edit = draft.lines[line.selection];
    return sum + (edit?.filled ?? prepared[slotKey(current.id, line.selection)] ?? 0);
  }, 0);
  const removedHere = Object.values(draft.lines).reduce((sum, l) => sum + l.removed.reduce((s, r) => s + r.qty, 0), 0);


  return (
    <Screen padded={false}>
      <div className="flex flex-col gap-2 px-4 pt-4">
        {header}
        <p className="mt-2 text-[14px] font-semibold text-muted-foreground">{fmt(t.fillTitle, { machine: current.name })}</p>
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="tabular text-[32px] font-bold tracking-[-0.035em]">{fmt(t.goingIn, { n: goingIn })}</h1>
          {removedHere > 0 && (
            <span className="rounded-full bg-card px-3 py-1.5 text-[13px] font-semibold">
              {fmt(t.removedBadge, { n: removedHere })}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 pb-44 pt-3">
        <ul className="surface-card flex flex-col px-2 py-1">
          {planned.map((line) => {
            const key = slotKey(current.id, line.selection);
            const prep = prepared[key] ?? 0;
            const edit = draft.lines[line.selection];
            const filled = edit?.filled ?? prep;
            const shortHere = line.take - prep;
            return (
              <li key={key} className="border-b border-border/60 last:border-0">
                <button
                  type="button"
                  onClick={() => setLineSheet(line.selection)}
                  className="flex min-h-16 w-full items-center gap-3 px-1 py-2 text-left"
                >
                  <span className="min-w-8 rounded-lg bg-surface px-1.5 py-1 text-center font-mono text-[12.5px] font-semibold">
                    {line.selection}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] font-semibold">{line.productName}</span>
                    <span
                      className={cn(
                        "text-[13px]",
                        shortHere > 0 ? "font-semibold text-warning" : "text-muted-foreground",
                      )}
                    >
                      {shortHere > 0
                        ? fmt(t.shortHere, { n: shortHere })
                        : line.stock === null
                          ? t.notCounted
                          : fmt(t.nowOf, { n: line.stock, cap: line.capacity })}
                    </span>
                  </span>
                  <span className="tabular text-[20px] font-bold">+{filled}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground/70" />
                </button>
              </li>
            );
          })}
        </ul>

        {unknownLines.length > 0 && draft.allFull === null && (
          <div className="surface-card flex flex-col gap-2.5 p-4">
            <p className="text-[14.5px] font-semibold">{fmt(t.unknownQuestion, { n: unknownLines.length })}</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="h-12 rounded-xl border border-input bg-card text-[15px] font-semibold"
                onClick={() => updateDraft(current.id, (d) => ({ ...d, allFull: true }))}
              >
                {t.yesFull}
              </button>
              <button
                type="button"
                className="h-12 rounded-xl bg-surface text-[15px] font-semibold"
                onClick={() => updateDraft(current.id, (d) => ({ ...d, allFull: false }))}
              >
                {t.notAll}
              </button>
            </div>
            <p className="text-[12.5px] text-muted-foreground">{t.optional}</p>
          </div>
        )}
        {draft.allFull === true && (
          <p className="px-2 text-[13px] text-positive">✓ {fmt(t.markedFull, { n: unknownLines.length })}</p>
        )}
      </div>

      <BottomBar>
        <button type="button" className={primary} onClick={() => finishStop(current.id)}>
          {t.fillAsPlanned}
        </button>
        <button type="button" className={ghost} onClick={() => setReport({ selection: null })}>
          {t.report}
        </button>
      </BottomBar>

      {lineSheet && (() => {
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

function SummaryRow({ label, value, big = false, last = false }: { label: string; value: number; big?: boolean; last?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between py-3.5", !last && "border-b border-border/60")}>
      <span className="text-[16px]">{label}</span>
      <span className={cn("tabular font-bold", big ? "text-[28px] tracking-[-0.03em]" : "text-[22px]")}>{value}</span>
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
