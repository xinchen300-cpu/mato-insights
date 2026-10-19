"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, CalendarX, Check, ChevronLeft, ChevronRight, MessageSquareText, Navigation, Timer, Trash2, TriangleAlert, Truck } from "lucide-react";
import Link from "next/link";
import { FillerAvatar } from "@/components/filler/avatar";
import { FrontView, type FrontSlot } from "@/components/machine/front-view";
import { RefillTips } from "@/components/refill/refill-tips";
import { useI18n } from "@/i18n/client";
import { duration, fmt } from "@/i18n/format";
import type { AvatarLook } from "@/lib/avatar";
import type { RefillRound, RouteTimes } from "@/lib/data";
import { roundReward, summarizeRound, type MyRound } from "@/lib/filler-stats";
import { haptic } from "@/lib/haptics";
import {
  allocate,
  pickList,
  returnsFor,
  shortages,
  slotKey,
  slotTally,
  stillMissing,
  tapOnce,
  type FlowLine,
  type RemovalReason,
  type StopRecord,
} from "@/lib/refill-flow";
import { DEFAULT_MACHINE_PHOTO, mediaUrl } from "@/lib/media";
import { legKey, samePlace, wazeLink } from "@/lib/round-settings";
import { bandBg, machineFill, machineTotals, type FillBand } from "@/lib/stock";
import { cn } from "@/lib/utils";
import { completeRound, completeStop, deleteRound, reopenStop, savePicked, skipStop, startRound, type StopInput } from "./actions";
import { RoundDone, RoundProgress, SlotProgress, StopToast, type SegmentState } from "./round-moments";
import { chip, ghost, outline, primary, stepper } from "./styles";

/** What the screen asks of the server: the real actions, or stand-ins for a preview. */
export type RoundApi = {
  savePicked: typeof savePicked;
  startRound: typeof startRound;
  completeStop: typeof completeStop;
  skipStop: typeof skipStop;
  completeRound: typeof completeRound;
  reopenStop: typeof reopenStop;
  deleteRound: typeof deleteRound;
};
const serverApi: RoundApi = { savePicked, startRound, completeStop, skipStop, completeRound, reopenStop, deleteRound };

// The round as a checklist: pack, each machine, bring back. One list that
// always says where the filler is, a clock that runs by itself from the start,
// and at a machine nothing more than a tap for every piece that goes in.
// Progress is kept on the phone too, so a reload in a basement loses nothing.

type LineDraft = {
  /** Pieces put in so far, one per tap (or the number typed); unset is "not yet". */
  filled?: number;
  /** The number was typed in the slot's sheet: final, also below what was set aside. */
  typed?: boolean;
  /**
   * What came out, one entry per reason. An entry of 0 is the filler saying
   * "none": then the plan's own count of past-date units is not added.
   */
  removed: { reason: RemovalReason; qty: number }[];
  countAfter: number | null;
  full: boolean;
};
type StopDraft = {
  /** When the filler first did something at this machine: their arrival, for the operator's timings. */
  checkedAt: string | null;
  /** When the machine was opened: the arrival when nothing was ticked there. */
  openedAt?: string | null;
  technical: boolean;
  note: string | null;
  allFull: boolean | null;
  lines: Record<string, LineDraft>;
  /** The operator's own checks ticked here; absent in drafts saved before they existed. */
  checks?: Record<string, boolean>;
};
type Saved = { picked: Record<string, number>; touched: boolean; drafts: Record<string, StopDraft> };
type ReportKind = RemovalReason | "count" | "technical";
type View = "home" | "pick" | "stop";
/** A stop as it is sent; when it happened is added at the moment of sending. */
type StopWork = Omit<StopInput, "checkedAgo" | "doneAgo">;
/** A machine just finished or skipped, waiting out its moment to be taken back. */
type Pending = { machineId: string; work: StopWork | null; checkedAt: string | null; tappedAt: number };

const emptyDraft = (): StopDraft => ({ checkedAt: null, technical: false, note: null, allFull: null, lines: {} });
const emptyLine = (): LineDraft => ({ removed: [], countAfter: null, full: false });
/** A stop as it was sent, as a draft again: opened anew, it shows what was entered, ready to change. */
const draftFrom = (record: StopRecord): StopDraft => ({
  checkedAt: record.checkedAt,
  openedAt: record.checkedAt,
  technical: record.technical,
  note: record.note,
  allFull: null,
  checks: record.checks,
  lines: Object.fromEntries(
    record.lines.map((line) => [line.selection, { filled: line.filled, typed: true, removed: line.removed, countAfter: line.countAfter, full: line.full }]),
  ),
});
const storageKey = (id: string) => `vendly-round-${id}`;
/** The moment of a tap. Only ever read in a handler, never while drawing. */
const tapTime = () => Date.now();

function load(id: string): Saved | null {
  try {
    const raw = localStorage.getItem(storageKey(id));
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}


export function RoundFlow({
  round: initial,
  who,
  look = null,
  times,
  history = null,
  filler = false,
  api = serverApi,
}: {
  round: RefillRound;
  /** The person holding the phone, under the name a round gets. */
  who: string | null;
  /** Their avatar, once they made one; else the first letter of their name. */
  look?: AvatarLook | null;
  /** Earlier rounds' drives, for the plan. */
  times: RouteTimes;
  /** This person's own finished rounds, for what the end of this one earned; null until it ends. */
  history?: MyRound[] | null;
  /** A filler knows the page the round leaves to as Home. */
  filler?: boolean;
  api?: RoundApi;
}) {
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
  const [report, setReport] = useState<{ selection: string | null; only?: ReportKind } | null>(null);
  const [lineSheet, setLineSheet] = useState<string | null>(null);
  const [countSheet, setCountSheet] = useState<string | null>(null);
  const [showShort, setShowShort] = useState(false);
  const [unchecked, setUnchecked] = useState<number | null>(null);
  const [skipArmed, setSkipArmed] = useState(false);
  const [skipAsk, setSkipAsk] = useState(false);
  const [reopenAsk, setReopenAsk] = useState(false);
  const [deleteAsk, setDeleteAsk] = useState(false);
  const [fullAsk, setFullAsk] = useState<{ open: "empty" | "planned"; selections: string[] } | null>(null);
  // The last question before a machine is done (Xin, 19-10-2026): anything over date? And if so, which.
  const [expiredAsk, setExpiredAsk] = useState<{
    machineId: string;
    open: "empty" | "planned";
    full?: string[];
    step: "ask" | "pick";
    counts: Record<string, number>;
  } | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingSkip, setPendingSkip] = useState(false);
  const [failedId, setFailedId] = useState<string | null>(null);
  // Right after a machine is done the big button changes meaning; a second
  // tap of the same thumb must not open the next machine.
  const [settling, setSettling] = useState(false);
  const pendingStop = useRef<Pending | null>(null);

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

  // The screen stays on while the round is on: a phone that locks between two machines costs a filler time.
  useEffect(() => {
    if (!readyAt || completed || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const hold = () => {
      if (document.visibilityState !== "visible") return;
      navigator.wakeLock.request("screen").then(
        (sentinel) => {
          lock = sentinel;
        },
        () => undefined,
      );
    };
    hold();
    document.addEventListener("visibilitychange", hold);
    return () => {
      document.removeEventListener("visibilitychange", hold);
      void lock?.release().catch(() => undefined);
    };
  }, [readyAt, completed]);

  const rows = useMemo(() => pickList(initial.lines), [initial.lines]);
  const totalTake = rows.reduce((sum, row) => sum + row.take, 0);
  const totalPicked = rows.reduce((sum, row) => sum + Math.min(row.take, picked[row.key] ?? 0), 0);
  const prepared = useMemo(() => allocate(initial.lines, picked), [initial.lines, picked]);
  // How full each machine still is, from the counted slots only: a machine
  // nobody counted yet gets a grey "?" instead of a made-up percentage.
  const fills = useMemo(() => machineTotals(initial.slots.map((slot) => ({ machine_id: slot.machineId, stock: slot.stock, capacity: slot.capacity }))), [initial.slots]);
  const fillOf = (machineId: string) => {
    const total = fills.get(machineId);
    return total ? machineFill(total.stock, total.capacity, total.counted) : null;
  };

  // Save the box now and then, so another phone can take over.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function setPicks(change: (current: Record<string, number>) => Record<string, number>) {
    setTouched(true);
    setPicked((current) => {
      const next = change(current);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void api.savePicked(initial.id, next).catch(() => undefined), 1200);
      return next;
    });
  }

  function draftFor(machineId: string) {
    return drafts[machineId] ?? emptyDraft();
  }
  /** The first thing done at a machine marks the arrival there. */
  const touch = (draft: StopDraft): StopDraft => (draft.checkedAt ? draft : { ...draft, checkedAt: new Date().toISOString() });
  function updateDraft(machineId: string, change: (draft: StopDraft) => StopDraft) {
    setDrafts((all) => ({ ...all, [machineId]: change(all[machineId] ?? emptyDraft()) }));
  }
  function updateLine(machineId: string, selection: string, change: (line: LineDraft) => LineDraft) {
    updateDraft(machineId, (draft) =>
      touch({
        ...draft,
        lines: { ...draft.lines, [selection]: change(draft.lines[selection] ?? emptyLine()) },
      }),
    );
  }

  function run(action: () => Promise<void>, after?: () => void, failed?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        after?.();
      } catch {
        failed?.();
        setError(t.failed);
      }
    });
  }

  function applyReport(machineId: string, kind: ReportKind, selection: string | null, value: number, note: string | null) {
    if (kind === "technical") {
      updateDraft(machineId, (d) => touch({ ...d, technical: true, note: note || d.note }));
      return;
    }
    if (!selection) return;
    if (kind === "count") {
      updateLine(machineId, selection, (line) => ({ ...line, countAfter: value }));
      return;
    }
    // One number per reason, the one last saved; 0 is kept, as "none".
    updateLine(machineId, selection, (line) => ({
      ...line,
      removed: [...line.removed.filter((r) => r.reason !== kind), { reason: kind, qty: value }],
    }));
  }

  /**
   * What came out of a slot as it will be written: what the filler entered.
   * Vendly adds nothing by date: the filler checks the dates by eye (Xin, 18-10-2026).
   */
  function removalsOf(edit: LineDraft) {
    return edit.removed.filter((r) => r.qty > 0);
  }

  /** Where the steppers of "something is wrong here" start: what is already noted, or what Vendly expects. */
  function startFor(machineId: string, kind: ReportKind, selection: string | null): number {
    if (kind === "technical") return 0;
    if (!selection) return kind === "count" ? 0 : 1;
    const edit = draftFor(machineId).lines[selection] ?? emptyLine();
    const line = initial.lines.find((l) => l.machineId === machineId && l.selection === selection);
    const slot = initial.slots.find((l) => l.machineId === machineId && l.selection === selection);
    const capacity = line?.capacity ?? slot?.capacity ?? 0;
    if (kind === "count") {
      if (edit.countAfter !== null) return edit.countAfter;
      if (edit.full) return capacity;
      const filled = edit.filled ?? 0;
      const out = removalsOf(edit).reduce((sum, r) => sum + r.qty, 0);
      const stock = line ? line.stock : (slot?.stock ?? null);
      return Math.min(capacity, stock === null ? filled : Math.max(0, stock - out) + filled);
    }
    const entered = edit.removed.find((r) => r.reason === kind);
    if (entered) return entered.qty;
    return 1;
  }

  /**
   * The stop's lines as they will be written. A slot took the pieces tapped in,
   * or the number typed. One not finished took what was tapped so far, unless
   * the filler says everything went in after all: then what was set aside.
   */
  function stopInput(machineId: string, open: "empty" | "planned", full?: Set<string>): StopWork {
    const draft = draftFor(machineId);
    const planned = initial.lines.filter((line) => line.machineId === machineId);
    const selections = new Set([...planned.map((line) => line.selection), ...Object.keys(draft.lines)]);
    return {
      technical: draft.technical,
      note: draft.note,
      checks: draft.checks,
      lines: [...selections].map((selection) => {
        const line = planned.find((l) => l.selection === selection);
        const edit = draft.lines[selection] ?? emptyLine();
        const prep = prepared[slotKey(machineId, selection)] ?? 0;
        const unfinished = line !== undefined && !slotTally(prep, edit.filled, edit.typed).done;
        return {
          selection,
          filled: unfinished && open === "planned" ? prep : (edit.filled ?? 0),
          removed: removalsOf(edit),
          countAfter: edit.countAfter,
          full: edit.full || Boolean(full?.has(selection)),
        };
      }),
    };
  }

  /**
   * Slots Vendly could not see into that got some, but not a whole slot's
   * worth: full now or not, only the filler knows. Asked, never guessed.
   */
  function unsureOf(machineId: string, open: "empty" | "planned"): string[] {
    return stopInput(machineId, open)
      .lines.filter((sent) => {
        const line = initial.lines.find((l) => l.machineId === machineId && l.selection === sent.selection);
        return line !== undefined && line.stock === null && sent.filled > 0 && sent.filled < line.capacity && sent.countAfter === null && !sent.full;
      })
      .map((sent) => sent.selection);
  }

  // The three-second window to take a finished or skipped machine back.
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      const job = pendingStop.current;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the countdown ends here, once
      setCountdown(null);
      if (!job) return;
      pendingStop.current = null;
      // Only this machine's mark comes off: another one may be waiting by now.
      const settle = () => setPendingId((id) => (id === job.machineId ? null : id));
      // Not sent: the machine is open again, so it cannot pass for done, and the filler is told which.
      const failed = () => {
        settle();
        setFailedId(job.machineId);
      };
      // Sent as "how long ago", so the moment of the tap counts, even from a locked phone.
      const doneAgo = Math.max(0, Date.now() - job.tappedAt);
      const doneAt = new Date(job.tappedAt).toISOString();
      const work = job.work;
      if (!work) {
        run(
          () => api.skipStop(initial.id, job.machineId, doneAgo),
          () => {
            setStops((all) => ({
              ...all,
              [job.machineId]: { checkedAt: null, completedAt: doneAt, skipped: true, technical: false, note: null, lines: [] },
            }));
            settle();
            setFailedId((id) => (id === job.machineId ? null : id));
            router.refresh();
          },
          failed,
        );
        return;
      }
      const checkedAgo = job.checkedAt ? Math.max(0, Date.now() - Date.parse(job.checkedAt)) : null;
      run(
        () => api.completeStop(initial.id, job.machineId, { ...work, checkedAgo, doneAgo }),
        () => {
          setStops((all) => ({
            ...all,
            [job.machineId]: {
              checkedAt: job.checkedAt,
              completedAt: doneAt,
              skipped: false,
              technical: work.technical,
              note: work.note,
              ...(initial.settings.checks.length && work.checks && Object.keys(work.checks).length > 0
                ? {
                    checks: Object.fromEntries(
                      initial.settings.checks.map((label) => [label, work.checks?.[label] === true]),
                    ),
                  }
                : {}),
              lines: work.lines.map((line) => ({
                ...line,
                prepared: prepared[slotKey(job.machineId, line.selection)] ?? 0,
                removed: line.removed as { reason: RemovalReason; qty: number }[],
              })),
            },
          }));
          settle();
          setFailedId((id) => (id === job.machineId ? null : id));
          router.refresh();
        },
        failed,
      );
      return;
    }
    const timer = setTimeout(() => setCountdown((n) => (n === null ? null : n - 1)), 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown]);

  // "Overslaan" stays armed for a moment only; a stray tap later does not skip.
  useEffect(() => {
    if (!skipArmed) return;
    const timer = setTimeout(() => setSkipArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [skipArmed]);
  useEffect(() => {
    if (!settling) return;
    const timer = setTimeout(() => setSettling(false), 900);
    return () => clearTimeout(timer);
  }, [settling]);

  const isDone = (machineId: string) => Boolean(stops[machineId]?.completedAt) || pendingId === machineId;
  // A machine with nothing planned stood full when the round was made: it
  // keeps its place on the route with a word, but nobody drives there. Since
  // 17-10-2026 it is only on the route; before, it was among the machines.
  const withWork = useMemo(() => new Set(initial.lines.map((line) => line.machineId)), [initial.lines]);
  const isFull = (machineId: string) => !withWork.has(machineId) && !isDone(machineId);
  const visits = initial.machines.filter((mc) => !isFull(mc.id));
  const openStops = visits.filter((mc) => !isDone(mc.id));
  const nextStop = openStops[0] ?? null;
  const lastDone =
    Object.entries(stops)
      .filter(([, stop]) => stop.completedAt && !stop.skipped)
      .map(([machineId, stop]) => ({ machineId, at: stop.completedAt as string }))
      .sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;
  // Two machines at one address are one stop on the road (Xin, 19-10-2026: the
  // snack machine stands with Diksmuide): no drive and no Waze between them.
  const addressOf = (stop: string) =>
    stop === "start" || stop === "end" ? initial.settings.depotAddress : (initial.machines.find((mc) => mc.id === stop)?.address ?? null);
  const hereAddress = addressOf(lastDone?.machineId ?? "start");

  function openStop(machineId: string) {
    // A machine may be opened before the drive there: the first thing done at
    // it is the arrival, and opening it only counts when nothing was.
    updateDraft(machineId, (d) => ({ ...d, openedAt: d.openedAt ?? new Date().toISOString() }));
    if (countdown !== null) setCountdown(0);
    setFailedId((id) => (id === machineId ? null : id));
    setStopId(machineId);
    setSkipArmed(false);
    setView("stop");
  }

  /** A machine already done or skipped: what was entered there, and the way to change it. */
  function viewStop(machineId: string) {
    if (countdown !== null) setCountdown(0);
    setReopenAsk(false);
    setStopId(machineId);
    setView("stop");
  }

  /** The arrows between machines: a done one shows what was entered, an open one opens. */
  function goToMachine(machineId: string) {
    if (stops[machineId]?.completedAt && pendingId !== machineId) viewStop(machineId);
    else openStop(machineId);
  }

  /** A done or skipped machine opened again (Xin, 19-10-2026): the stock goes back, what was entered stays to change. */
  function reopen(machineId: string) {
    const record = stops[machineId];
    if (!record) return;
    run(
      () => api.reopenStop(initial.id, machineId),
      () => {
        setReopenAsk(false);
        setStops((all) => {
          const rest = { ...all };
          delete rest[machineId];
          return rest;
        });
        setDrafts((all) => ({ ...all, [machineId]: draftFrom(record) }));
        openStop(machineId);
        router.refresh();
      },
    );
  }

  /**
   * "Ronde afronden": the round closes as it stands (Xin, 19-10-2026: no
   * "Terugbrengen" step). What was taken along and not used goes back to stock,
   * what came out over date counts as waste, as the round always reckoned it.
   */
  function finishRound() {
    run(
      () => api.completeRound(initial.id, []),
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
    );
  }

  /** "Ronde verwijderen", at any point; then back to Bijvullen. */
  function removeRound() {
    run(
      () =>
        api.deleteRound(initial.id).then(() => {
          try {
            localStorage.removeItem(storageKey(initial.id));
          } catch {
            // Nothing kept on this phone then.
          }
          router.push("/refill");
          router.refresh();
        }),
      () => setDeleteAsk(false),
    );
  }

  function hold(job: Pending) {
    pendingStop.current = job;
    setPendingId(job.machineId);
    setPendingSkip(job.work === null);
    setUnchecked(null);
    setFullAsk(null);
    setExpiredAsk(null);
    setSkipAsk(false);
    setSkipArmed(false);
    setView("home");
    setSettling(true);
    setCountdown(3);
  }

  function finishStop(machineId: string, open: "empty" | "planned", full?: Set<string>, expired?: Record<string, number>) {
    haptic("success");
    const draft = draftFor(machineId);
    const work = stopInput(machineId, open, full);
    if (expired) {
      // What the last question says came out over date, per slot: it replaces what was noted before; 0 is none.
      work.lines = work.lines.map((line) =>
        line.selection in expired
          ? {
              ...line,
              removed: [
                ...line.removed.filter((r) => r.reason !== "expired"),
                ...(expired[line.selection] > 0 ? [{ reason: "expired", qty: expired[line.selection] }] : []),
              ],
            }
          : line,
      );
      for (const [selection, qty] of Object.entries(expired)) {
        if (qty > 0 && !work.lines.some((line) => line.selection === selection)) {
          work.lines.push({ selection, filled: 0, removed: [{ reason: "expired", qty }], countAfter: null, full: false });
        }
      }
    }
    hold({ machineId, work, checkedAt: draft.checkedAt ?? draft.openedAt ?? null, tappedAt: tapTime() });
  }

  /** Before a machine is done: "Zijn er gerechten over datum?", starting from what was already noted here. */
  function askExpired(machineId: string, open: "empty" | "planned", full?: Set<string>) {
    setUnchecked(null);
    setFullAsk(null);
    // A snack machine holds no dishes to ask about (Xin, 19-10-2026): done at once.
    if (initial.machines.find((mc) => mc.id === machineId)?.type === "spiral") return finishStop(machineId, open, full);
    const counts: Record<string, number> = {};
    for (const [selection, line] of Object.entries(draftFor(machineId).lines)) {
      const qty = line.removed.find((r) => r.reason === "expired")?.qty ?? 0;
      if (qty > 0) counts[selection] = qty;
    }
    setExpiredAsk({ machineId, open, full: full ? [...full] : undefined, step: "ask", counts });
  }

  /** "Klaar", or after the question about unticked slots: one more question when a slot may be full now. */
  function requestFinish(machineId: string, open: "empty" | "planned") {
    const unsure = unsureOf(machineId, open);
    if (unsure.length > 0) {
      setUnchecked(null);
      setFullAsk({ open, selections: unsure });
      return;
    }
    askExpired(machineId, open);
  }

  function skipMachine(machineId: string) {
    haptic();
    hold({ machineId, work: null, checkedAt: null, tappedAt: tapTime() });
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
      () => api.startRound(initial.id, picked),
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
        <button type="button" onClick={back} className="flex h-11 items-center gap-1 rounded-full bg-surface pl-2 pr-4 text-[15px] font-semibold active:scale-95">
          <ChevronLeft className="size-5" />
          {t.backToRound}
        </button>
      ) : countdown === null ? (
        // Out of the round, back to the app: the round keeps where it was and is there to pick up again.
        // Not while a machine waits out its three seconds: leaving then would never send it.
        <Link href="/refill" className="flex h-11 items-center gap-1 rounded-full bg-surface pl-2 pr-4 text-[15px] font-semibold active:scale-95">
          <ChevronLeft className="size-5" />
          {filler ? m.nav.home : m.nav.refill}
        </Link>
      ) : (
        <span />
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
    const visited = Object.values(stops).filter((stop) => !stop.skipped).length;
    // What this round earned, against this person's own rounds before it.
    // Until the earlier rounds are in, the end shows the round itself; what it earned follows.
    const reward =
      readyAt && completedAt && history
        ? roundReward(history, summarizeRound({ id: initial.id, readyAt, completedAt, machineIds: initial.machines.map((mc) => mc.id), stops }))
        : null;
    return (
      <Screen>
        {header()}
        <RoundDone
          reward={reward}
          minutes={readyAt && completedAt ? (Date.parse(completedAt) - Date.parse(readyAt)) / 60000 : null}
          summary={fmt(visited === 1 ? t.thanksSummaryOne : t.thanksSummary, { machines: visited, filled, removed, back: leftover })}
          tomorrow={stillMissing(initial.lines, picked, stops)}
        />
      </Screen>
    );
  }

  // ——— Packing ———
  // Once the round is on, the boxes are only looked at: what went in each, to check at a machine (Xin, 19-10-2026).
  if (view === "pick") {
    const locked = Boolean(readyAt);
    const short = shortages(rows, picked);
    // Which slots a product goes in at a machine, so a box can be packed slot by slot.
    const slotsOf = (machineId: string, productId: string) =>
      initial.lines
        .filter((line) => line.machineId === machineId && line.productId === productId && line.take > 0)
        .map((line) => line.selection)
        .join(" · ");
    const boxes = initial.machines.flatMap((machine) => {
      const boxRows = rows.filter((row) => row.machineId === machine.id);
      return boxRows.length > 0 ? [{ machine, rows: boxRows, take: boxRows.reduce((sum, row) => sum + row.take, 0) }] : [];
    });
    const shortTotal = short.reduce((sum, item) => sum + item.n, 0);
    const countRow = rows.find((row) => row.key === countSheet) ?? null;
    return (
      <Screen padded={false}>
        <div className="flex flex-col gap-3 px-4 pt-4">
          {header(() => setView("home"))}
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="text-[30px] font-bold tracking-[-0.03em]">{t.pickTitle}</h1>
            <span className="tabular text-[17px] font-bold tracking-[-0.01em]">{fmt(t.pickTotal, { n: totalPicked, total: totalTake })}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface" aria-hidden="true">
            <div
              className="h-full rounded-full bg-foreground transition-[width] duration-300"
              style={{ width: `${totalTake ? Math.round((totalPicked / totalTake) * 100) : 0}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[14.5px] text-muted-foreground">{locked ? t.pickLocked : t.pickHint}</p>
            {!locked && (
              <button
                type="button"
                className="h-10 shrink-0 whitespace-nowrap rounded-full px-3 text-[14.5px] font-semibold"
                onClick={() => {
                  haptic();
                  setPicks(() => Object.fromEntries(rows.map((row) => [row.key, row.take])));
                }}
              >
                {t.checkAll}
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 pb-36 pt-3">
          {/* One box per machine, in the order of the round (Xin, 18-10-2026): each is packed on its own. */}
          {boxes.map((box, index) => {
            const have = box.rows.reduce((sum, row) => sum + Math.min(row.take, picked[row.key] ?? 0), 0);
            const boxDone = have >= box.take;
            return (
              <section key={box.machine.id} className="flex flex-col gap-2">
                <div className="flex items-center gap-1 px-1">
                  {/* The box's number; a tap ticks the whole box, or clears it. */}
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={boxDone}
                    aria-label={fmt(t.boxAll, { n: index + 1, machine: box.machine.name })}
                    disabled={locked}
                    onClick={() => {
                      haptic();
                      setPicks((current) => ({ ...current, ...Object.fromEntries(box.rows.map((row) => [row.key, boxDone ? 0 : row.take])) }));
                    }}
                    className={cn(
                      "tabular grid size-11 shrink-0 place-items-center rounded-full text-[17px] font-bold transition-colors",
                      boxDone ? "bg-positive text-white" : "bg-foreground text-background",
                    )}
                  >
                    {boxDone ? <Check className="size-5" strokeWidth={3} aria-hidden="true" /> : index + 1}
                  </button>
                  <span className="flex min-w-0 flex-1 flex-col pl-2">
                    <span className="truncate text-[17px] font-bold tracking-[-0.01em]">{box.machine.name}</span>
                    <span className={cn("tabular text-[13.5px]", boxDone ? "font-semibold text-positive" : "text-muted-foreground")}>
                      {fmt(t.boxProgress, { n: have, total: box.take })}
                    </span>
                  </span>
                  <span className="w-16 self-end text-center text-[12px] font-semibold text-muted-foreground">{t.pickTakeCol}</span>
                  <span className="w-16 self-end text-center text-[12px] font-semibold text-muted-foreground">{t.pickHaveCol}</span>
                </div>
                <ul className="surface-card flex flex-col px-2 py-1">
                  {box.rows.map((row) => {
                    const n = Math.min(row.take, picked[row.key] ?? 0);
                    const done = n >= row.take;
                    return (
                      <li key={row.key} className="flex items-center gap-1 border-b border-border/60 last:border-0">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={done}
                          disabled={locked}
                          onClick={() => {
                            haptic();
                            setPicks((current) => ({ ...current, [row.key]: done ? 0 : row.take }));
                          }}
                          className="flex min-h-[68px] min-w-0 flex-1 items-center gap-3 px-1 text-left"
                        >
                          <Tick done={done} />
                          <ProductPhoto path={row.photoPath} />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className={cn("truncate text-[16px] font-semibold", done && "text-muted-foreground line-through")}>
                              {row.productName}
                            </span>
                            <span className="tabular truncate text-[13px] text-muted-foreground">
                              {fmt(t.boxSlots, { slots: slotsOf(row.machineId, row.productId) })}
                            </span>
                          </span>
                        </button>
                        <span className="tabular w-16 shrink-0 text-center text-[18px] font-bold">{row.take}</span>
                        <button
                          type="button"
                          disabled={locked}
                          onClick={() => setCountSheet(row.key)}
                          className={cn(
                            "tabular h-11 w-16 shrink-0 rounded-xl text-[18px] font-bold transition-colors",
                            done ? "bg-positive/15 text-positive" : n > 0 ? "bg-warning/20 text-warning" : "bg-surface text-muted-foreground",
                          )}
                          aria-label={fmt(t.howManyOf, { product: row.productName })}
                        >
                          {n > 0 ? n : "–"}
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
          {locked ? (
            <button type="button" className={outline} onClick={() => setView("home")}>
              <ChevronLeft className="size-5" aria-hidden="true" />
              {t.back}
            </button>
          ) : (
            <div className="flex gap-2">
              <BackButton onClick={() => setView("home")} />
              <button
                type="button"
                className={cn(primary, "flex-1")}
                disabled={pending || totalPicked === 0}
                onClick={() => (shortTotal > 0 ? setShowShort(true) : start())}
              >
                {pending ? t.sending : t.start}
              </button>
            </div>
          )}
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
            {/* What is short, one product a line: the number first, then what. */}
            <div className="flex flex-col gap-3 rounded-2xl bg-warning/10 px-4 py-3.5">
              <p className="flex items-center gap-2.5 text-[16px] font-bold">
                <TriangleAlert className="size-5 shrink-0 text-warning" aria-hidden="true" />
                {fmt(t.short, { n: shortTotal })}
              </p>
              <ul className="flex flex-col gap-2">
                {short.map((item) => (
                  <li key={item.productId} className="flex items-baseline gap-3 text-[16px]">
                    <span className="tabular w-[30px] shrink-0 text-right font-bold">{item.n}</span>
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  </li>
                ))}
              </ul>
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

  // ——— A machine already done or skipped: what was entered, and "Aanpassen" ———
  const doneMachine =
    view === "stop" && stopId && pendingId !== stopId && stops[stopId]?.completedAt ? (initial.machines.find((mc) => mc.id === stopId) ?? null) : null;
  if (doneMachine && readyAt) {
    const record = stops[doneMachine.id];
    const index = visits.findIndex((mc) => mc.id === doneMachine.id);
    const before = index > 0 ? visits[index - 1] : undefined;
    const after = index >= 0 ? visits[index + 1] : undefined;
    const productOf = (selection: string) =>
      initial.lines.find((line) => line.machineId === doneMachine.id && line.selection === selection)?.productName ??
      initial.slots.find((slot) => slot.machineId === doneMachine.id && slot.selection === selection)?.productName ??
      "";
    // Only the slots something happened to.
    const entered = record.lines.filter((line) => line.filled > 0 || line.removed.length > 0 || line.countAfter !== null || line.full);
    return (
      <Screen padded={false}>
        <div className="flex flex-col gap-2 px-4 pt-4">
          {header(() => setView("home"))}
          <StopNav
            label={fmt(t.stopOf, { n: index + 1, total: visits.length })}
            onPrev={before ? () => goToMachine(before.id) : undefined}
            onNext={after ? () => goToMachine(after.id) : undefined}
          />
          <div className="flex items-center gap-3.5">
            <MachineThumb path={doneMachine.photoPath} className="size-16 rounded-2xl" />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[28px] font-bold leading-tight tracking-[-0.03em]">{doneMachine.name}</h1>
              <p className={cn("mt-0.5 flex items-center gap-1.5 text-[15px] font-semibold", record.skipped ? "text-warning" : "text-positive")}>
                {!record.skipped && <Check className="size-4" strokeWidth={3} aria-hidden="true" />}
                {record.skipped ? t.skipped : fmt(t.doneAt, { time: f.time(record.completedAt!) })}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 pb-36 pt-3">
          {entered.length === 0 ? (
            <p className="px-2 text-[15px] text-muted-foreground">{t.nothingEntered}</p>
          ) : (
            <ul className="surface-card flex flex-col px-3 py-1">
              {entered.map((line) => {
                const out = line.removed.reduce((sum, r) => sum + r.qty, 0);
                const notes = [
                  ...(out > 0 ? [fmt(t.removedBadge, { n: out })] : []),
                  ...(line.countAfter !== null ? [fmt(t.countedTo, { n: line.countAfter })] : line.full ? [t.seenFull] : []),
                ];
                return (
                  <li key={line.selection} className="flex min-h-[60px] items-center gap-3 border-b border-border/60 py-2 last:border-0">
                    <span className="min-w-8 rounded-lg bg-surface px-1.5 py-1 text-center font-mono text-[12.5px] font-semibold">{line.selection}</span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[15.5px] font-semibold">{productOf(line.selection)}</span>
                      {notes.length > 0 && <span className="text-[13px] text-muted-foreground">{notes.join(" · ")}</span>}
                    </span>
                    <span className="tabular shrink-0 text-[17px] font-bold">{line.filled > 0 ? fmt(t.filledIn, { n: line.filled }) : "–"}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <BottomBar>
          <div className="flex gap-2">
            <BackButton onClick={() => setView("home")} />
            <button type="button" className={cn(primary, "min-w-0 flex-1")} disabled={pending} onClick={() => setReopenAsk(true)}>
              <span className="truncate">{record.skipped ? t.doAnyway : t.reopen}</span>
            </button>
          </div>
        </BottomBar>

        {reopenAsk && (
          <Sheet onClose={() => setReopenAsk(false)}>
            <h2 className="text-[22px] font-bold tracking-[-0.02em]">{fmt(t.reopenTitle, { machine: doneMachine.name })}</h2>
            <p className="text-[15.5px] text-muted-foreground">{record.skipped ? t.reopenSkippedHint : t.reopenHint}</p>
            <button type="button" className={primary} disabled={pending} onClick={() => reopen(doneMachine.id)}>
              {pending ? t.reopening : t.reopenConfirm}
            </button>
            <button type="button" className={ghost} onClick={() => setReopenAsk(false)}>
              {t.back}
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
    const stopIndex = visits.findIndex((mc) => mc.id === current.id) + 1;
    const before = visits[stopIndex - 2];
    const after = visits[stopIndex];
    const prepOf = (line: FlowLine) => prepared[slotKey(current.id, line.selection)] ?? 0;
    const tallyOf = (line: FlowLine) => {
      const edit = draft.lines[line.selection];
      return slotTally(prepOf(line), edit?.filled, edit?.typed);
    };
    const open = planned.filter((line) => !tallyOf(line).done);
    // Pieces in so far against pieces to go in, for the bar at the top.
    const piecesIn = planned.reduce((sum, line) => sum + Math.min(tallyOf(line).n, tallyOf(line).aim), 0);
    const piecesAll = planned.reduce((sum, line) => sum + tallyOf(line).aim, 0);
    // What comes out here so far: entered, plus past-date units of the slots already filled.
    const removedHere = stopInput(current.id, "empty").lines.reduce((sum, l) => sum + l.removed.reduce((s, r) => s + r.qty, 0), 0);
    const ticked = Object.values(draft.lines).some((line) => line.filled !== undefined);
    const fillAll = () =>
      updateDraft(current.id, (d) =>
        touch({
          ...d,
          lines: Object.fromEntries([
            ...Object.entries(d.lines),
            ...planned
              .filter((line) => !slotTally(prepOf(line), d.lines[line.selection]?.filled, d.lines[line.selection]?.typed).done)
              .map((line) => [line.selection, { ...(d.lines[line.selection] ?? emptyLine()), filled: prepOf(line), typed: false }]),
          ]),
        }),
      );
    /** One tap, one piece in. A slot with nothing set aside opens its sheet instead: there is nothing to count. */
    function tap(line: FlowLine) {
      const prep = prepOf(line);
      if (prep === 0) return setLineSheet(line.selection);
      const next = tapOnce(prep, draft.lines[line.selection]?.filled);
      if (next === null) return;
      haptic(next >= prep ? "success" : "tick");
      updateLine(current!.id, line.selection, (l) => ((l.filled ?? 0) >= prep ? l : { ...l, filled: (l.filled ?? 0) + 1, typed: false }));
    }

    return (
      <Screen padded={false}>
        <div className="flex flex-col gap-2 px-4 pt-4">
          {header(() => setView("home"))}
          <StopNav
            label={fmt(t.stopOf, { n: stopIndex, total: visits.length })}
            onPrev={before ? () => goToMachine(before.id) : undefined}
            onNext={after ? () => goToMachine(after.id) : undefined}
          />
          <div className="flex items-center gap-3.5">
            <MachineThumb path={current.photoPath} className="size-16 rounded-2xl" />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[28px] font-bold leading-tight tracking-[-0.03em]">{current.name}</h1>
              <FillPill fill={fillOf(current.id)} />
            </div>
          </div>
          <SlotProgress done={piecesIn} total={piecesAll} all={open.length === 0} />
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={chip} onClick={() => setReport({ selection: null })}>
              <TriangleAlert className="size-4 text-warning" />
              {t.reportShort}
            </button>
            {/* Straight to "how many over date", the one he needs most (Xin, 18-10-2026); not for snacks (19-10). */}
            {current.type !== "spiral" && (
              <button type="button" className={chip} onClick={() => setReport({ selection: null, only: "expired" })}>
                <CalendarX className="size-4 text-negative" />
                {t.reasonExpired}
              </button>
            )}
            {/* The way there in Waze, also once the machine is open. */}
            {current.address && !samePlace(hereAddress, current.address) && (
              <a href={wazeLink(current.address) ?? undefined} target="_blank" rel="noopener noreferrer" className={chip}>
                <Navigation className="size-4 text-[#05c8f7]" aria-hidden="true" />
                {t.waze}
              </a>
            )}
            {initial.settings.allowSkip && (
              <button
                type="button"
                className={cn(chip, skipArmed && "bg-foreground text-background ring-foreground")}
                disabled={pending}
                onClick={() => {
                  // Something is ticked here already: skipping would drop it, so ask in words.
                  if (ticked) return setSkipAsk(true);
                  if (!skipArmed) return setSkipArmed(true);
                  skipMachine(current.id);
                }}
              >
                {skipArmed ? t.skipConfirm : t.skipShort}
              </button>
            )}
            {removedHere > 0 && <span className={cn(chip, "ring-warning/40")}>{fmt(t.removedBadge, { n: removedHere })}</span>}
          </div>
          {/* The dates are the filler's to check by eye: one line at every machine with dishes, nothing to tap (Xin, 18-10-2026). */}
          {current.type !== "spiral" && (
            <p className="mt-3 flex items-center gap-2.5 rounded-xl bg-surface px-3 py-2.5 text-[14.5px] font-medium">
              <CalendarCheck className="size-5 shrink-0" aria-hidden="true" />
              {t.checkDates}
            </p>
          )}
          <div className="mt-2 flex items-center justify-between">
            <p className="text-[14.5px] text-muted-foreground">{t.fillHint}</p>
            {open.length > 0 && (
              <button
                type="button"
                className="h-10 shrink-0 whitespace-nowrap rounded-full px-3 text-[14.5px] font-semibold"
                onClick={() => {
                  haptic();
                  fillAll();
                }}
              >
                {t.fillAll}
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
              const tally = tallyOf(line);
              // Typed below what was set aside: done, but not the plan.
              const fewer = tally.done && edit?.typed === true && tally.n < prep;
              const shortHere = line.take - prep;
              const out = (edit?.removed ?? []).reduce((sum, r) => sum + r.qty, 0);
              const notes = [
                ...(out > 0 ? [{ text: fmt(t.removedBadge, { n: out }), warn: false }] : []),
                ...(shortHere > 0 ? [{ text: fmt(t.shortHere, { n: shortHere }), warn: true }] : []),
              ];
              return (
                <li key={key} className="flex items-center gap-2 border-b border-border/60 last:border-0">
                  <button
                    type="button"
                    onClick={() => tap(line)}
                    aria-label={fmt(t.tapLabel, { slot: line.selection, product: line.productName, n: tally.n, total: prep })}
                    className="flex min-h-[76px] min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-2.5 text-left transition-colors active:bg-surface/70"
                  >
                    {/* The next slot to do stands out, so the eye goes straight to it. */}
                    <span
                      className={cn(
                        "min-w-8 rounded-lg px-1.5 py-1 text-center font-mono text-[12.5px] font-semibold transition-colors",
                        tally.done
                          ? "bg-positive/15 text-positive"
                          : line.selection === open[0]?.selection
                            ? "bg-foreground text-background"
                            : "bg-surface",
                      )}
                    >
                      {line.selection}
                    </span>
                    <ProductPhoto path={line.photoPath} />
                    <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <span className={cn("truncate text-[15.5px] font-semibold", tally.done && "text-muted-foreground")}>
                        {line.productName}
                      </span>
                      {Math.max(prep, tally.n) > 0 && (
                        <TapBar n={tally.n} of={Math.max(prep, tally.n)} tone={fewer ? "fewer" : tally.done ? "done" : "busy"} />
                      )}
                      <span className="text-[13px] leading-snug text-muted-foreground">
                        {notes.length === 0
                          ? line.stock === null
                            ? t.notCounted
                            : fmt(t.nowOf, { n: line.stock, cap: line.capacity })
                          : notes.map((note, i) => (
                              <span key={note.text} className={cn(note.warn && "font-semibold text-warning")}>
                                {i > 0 && " · "}
                                {note.text}
                              </span>
                            ))}
                      </span>
                    </span>
                  </button>
                  {/* The count: tapped in of what goes in. A tap opens the exact number and "something else". */}
                  <button
                    type="button"
                    onClick={() => setLineSheet(line.selection)}
                    className={cn(
                      "tabular flex h-11 min-w-[60px] shrink-0 items-center justify-center gap-1 rounded-xl px-2.5 text-[17px] font-bold transition-colors",
                      fewer ? "bg-warning/15 text-warning" : tally.done ? "bg-positive/15 text-positive" : "bg-surface",
                    )}
                    aria-label={fmt(t.howManyIn, { slot: line.selection })}
                  >
                    {tally.done && !fewer && tally.n > 0 && <Check className="size-4" strokeWidth={3} aria-hidden="true" />}
                    {prep === 0 && tally.n === 0 ? "–" : `${tally.n}/${prep}`}
                  </button>
                </li>
              );
            })}
          </ul>
          {/* The operator's checks as tips, not boxes to tick at every machine. */}
          <RefillTips tips={initial.settings.checks} className="mt-1" />
        </div>

        <BottomBar>
          <div className="flex gap-2">
            {/* Back to the route: what is tapped here stays, the machine is not done until "Klaar". */}
            <BackButton onClick={() => setView("home")} />
            <button
              type="button"
              className={cn(primary, "min-w-0 flex-1", open.length === 0 && "ready-shine")}
              onClick={() => (open.length > 0 ? setUnchecked(open.length) : requestFinish(current.id, "planned"))}
            >
              {open.length === 0 && <Check className="size-5" strokeWidth={3} aria-hidden="true" />}
              <span className="truncate">{fmt(t.doneWith, { machine: current.name })}</span>
            </button>
          </div>
        </BottomBar>

        {unchecked !== null && (
          // One plain question about the slots not tapped full, and answers that say what will count.
          <Sheet onClose={() => setUnchecked(null)}>
            <h2 className="text-[24px] font-bold tracking-[-0.02em]">{open.length === 1 ? t.inQuestionOne : t.inQuestion}</h2>
            <ul className="flex flex-col gap-2 rounded-2xl bg-surface/70 p-3 text-[15.5px]">
              {open.map((line) => (
                <li key={line.selection} className="flex items-center gap-2.5">
                  <span className="min-w-8 rounded-lg bg-card px-1.5 py-0.5 text-center font-mono text-[12.5px] font-semibold">
                    {line.selection}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{line.productName}</span>
                  <span className="tabular shrink-0 text-[14px] text-muted-foreground">
                    {fmt(t.tappedOf, { n: tallyOf(line).n, total: prepOf(line) })}
                  </span>
                </li>
              ))}
            </ul>
            <button type="button" className={primary} onClick={() => requestFinish(current.id, "planned")}>
              {t.yesAllIn}
            </button>
            {/* Not all in: back to the slots to set the right numbers (Xin, 19-10-2026). */}
            <button type="button" className={outline} onClick={() => setUnchecked(null)}>
              {t.noAdjust}
            </button>
          </Sheet>
        )}
        {fullAsk && (
          <Sheet onClose={() => setFullAsk(null)}>
            <h2 className="text-[22px] font-bold tracking-[-0.02em]">
              {fmt(fullAsk.selections.length === 1 ? t.unknownQuestionOne : t.unknownQuestion, { n: fullAsk.selections.length })}
            </h2>
            <ul className="flex flex-col gap-1 text-[15.5px]">
              {fullAsk.selections.map((selection) => (
                <li key={selection} className="flex gap-2">
                  <span className="min-w-8 rounded-lg bg-surface px-1.5 py-0.5 text-center font-mono text-[12.5px] font-semibold">
                    {selection}
                  </span>
                  <span className="truncate font-semibold">{planned.find((line) => line.selection === selection)?.productName}</span>
                </li>
              ))}
            </ul>
            <p className="text-[15px] text-muted-foreground">{t.unknownHint}</p>
            <button type="button" className={primary} onClick={() => askExpired(current.id, fullAsk.open, new Set(fullAsk.selections))}>
              {t.yesFull}
            </button>
            <button type="button" className={outline} onClick={() => askExpired(current.id, fullAsk.open)}>
              {t.notAll}
            </button>
          </Sheet>
        )}
        {expiredAsk?.machineId === current.id &&
          (expiredAsk.step === "ask" ? (
            <Sheet onClose={() => setExpiredAsk(null)}>
              <h2 className="text-[24px] font-bold tracking-[-0.02em]">{t.expiredQuestion}</h2>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className={cn(outline, "gap-2")} onClick={() => setExpiredAsk({ ...expiredAsk, step: "pick" })}>
                  <CalendarX className="size-5 text-negative" aria-hidden="true" />
                  {t.expiredYes}
                </button>
                <button
                  type="button"
                  className={primary}
                  onClick={() =>
                    finishStop(current.id, expiredAsk.open, expiredAsk.full ? new Set(expiredAsk.full) : undefined)
                  }
                >
                  {t.expiredNo}
                </button>
              </div>
            </Sheet>
          ) : (
            <ExpiredPick
              slots={machineSlots.filter((slot) => slot.productName)}
              counts={expiredAsk.counts}
              doneLabel={fmt(t.doneWith, { machine: current.name })}
              onChange={(selection, n) => setExpiredAsk({ ...expiredAsk, counts: { ...expiredAsk.counts, [selection]: n } })}
              onDone={() =>
                finishStop(current.id, expiredAsk.open, expiredAsk.full ? new Set(expiredAsk.full) : undefined, expiredAsk.counts)
              }
              onBack={() => setExpiredAsk({ ...expiredAsk, step: "ask" })}
              onClose={() => setExpiredAsk(null)}
            />
          ))}
        {skipAsk && (
          <Sheet onClose={() => setSkipAsk(false)}>
            <h2 className="text-[22px] font-bold tracking-[-0.02em]">{fmt(t.skipTickedTitle, { machine: current.name })}</h2>
            <p className="text-[15.5px] text-muted-foreground">{t.skipTickedHint}</p>
            <button type="button" className={primary} onClick={() => skipMachine(current.id)}>
              {t.skipShort}
            </button>
            <button type="button" className={ghost} onClick={() => setSkipAsk(false)}>
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
                  updateLine(current.id, line.selection, (l) => ({ ...l, filled: value, typed: true }));
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
            only={report.only}
            startFor={(kind, selection) => startFor(current.id, kind, selection)}
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
  const failedMachine = initial.machines.find((mc) => mc.id === failedId && !stops[mc.id]?.completedAt) ?? null;
  const pieces = (machineId: string) =>
    initial.lines
      .filter((line) => line.machineId === machineId)
      .reduce((sum, line) => sum + (readyAt ? (prepared[slotKey(machineId, line.selection)] ?? 0) : line.take), 0);
  const steps: {
    key: string;
    title: string;
    sub: string;
    /** "full": a machine with nothing to do, passed by. */
    state: "done" | "now" | "later" | "skipped" | "full";
    aside?: string;
    onOpen?: () => void;
    /** Machine steps only: the photo to recognise it by. */
    machine?: { photoPath: string | null; id: string };
  }[] = [
    {
      key: "pick",
      title: t.pickTitle,
      sub: readyAt ? fmt(t.stepPickDone, { n: totalPicked }) : fmt(t.stepPickSub, { n: totalTake }),
      state: readyAt ? "done" : "now",
      // Also once the round is on: then only to look at what went in each box.
      onOpen: () => setView("pick"),
    },
    ...initial.route.map((machine) => {
      if (isFull(machine.id)) {
        return { key: machine.id, title: machine.name, sub: t.fullStop, state: "full" as const, machine: { photoPath: machine.photoPath, id: machine.id } };
      }
      const record = stops[machine.id];
      const done = isDone(machine.id);
      const slotsHere = initial.lines.filter((line) => line.machineId === machine.id).length;
      return {
        key: machine.id,
        title: machine.name,
        sub: fmt(slotsHere === 1 ? t.stopSubOne : t.stopSub, { slots: slotsHere, n: pieces(machine.id) }),
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
        onOpen: !readyAt
          ? undefined
          : !done
            ? () => openStop(machine.id)
            : record?.completedAt && pendingId !== machine.id
              ? () => viewStop(machine.id)
              : undefined,
        machine: { photoPath: machine.photoPath, id: machine.id },
      };
    }),
    // Back to where the round began (Xin, 19-10-2026: no "Terugbrengen" step any more).
    {
      key: "finish",
      title: t.stepBackStart,
      sub: initial.settings.depotAddress ?? t.stepBackStartSub,
      state: readyAt && openStops.length === 0 && countdown === null ? "now" : "later",
    },
  ];

  // The round can always go (Xin, 19-10-2026), just not while a machine is on its way to being saved.
  const canDelete = countdown === null && !pendingId;
  const doneCount = Object.values(stops).filter((stop) => stop.completedAt && !stop.skipped).length;

  // The round as a bar, one segment per machine, and where the filler was
  // last done, for the estimate: the latest machine filled (a skip says
  // nothing about where they are now).
  const segmentOf = (machineId: string): SegmentState =>
    stops[machineId]?.skipped || (pendingId === machineId && pendingSkip)
      ? "skipped"
      : isDone(machineId)
        ? "done"
        : machineId === nextStop?.id
          ? "now"
          : "later";
  // The drive into each step, as earlier rounds measured it: from the start to
  // the first machine, between machines (either way round), and back; until
  // then, as worked out from the addresses. It comes from the last step before
  // it with work: a full machine is driven past.
  const endOf = (key: string) => (key === "pick" ? "start" : key === "finish" ? "end" : key);
  const driveInto = (index: number) => {
    let back = index - 1;
    while (back > 0 && steps[back].state === "full") back -= 1;
    const from = endOf(steps[back].key);
    const to = endOf(steps[index].key);
    if (samePlace(addressOf(from), addressOf(to))) return t.samePlace;
    const measured = times.legs[`${from}→${to}`] ?? (from !== "start" && to !== "end" ? times.legs[`${to}→${from}`] : undefined);
    const minutes = measured?.minutes ?? initial.settings.drive[legKey(from, to)];
    if (!minutes) return null;
    const time = duration(Math.max(1, minutes), m.refill.runTime, m.refill.runTimeHours);
    return fmt(to === "end" ? t.driveBack : t.drive, { time });
  };

  return (
    <Screen padded={false}>
      <div className="flex flex-col gap-1 px-4 pt-4">
        {header()}
        {/* A big hello before the start; once the round is on, the name steps back for the work. */}
        <div className={cn("flex items-center", readyAt ? "mt-3 gap-2.5" : "mt-4 gap-3.5")}>
          {look ? (
            <span className={cn("block shrink-0 overflow-hidden rounded-full bg-primary/15", readyAt ? "size-10" : "size-14")} aria-hidden="true">
              <FillerAvatar look={look} className="size-full" />
            </span>
          ) : (
            who && (
              <span
                className={cn(
                  "grid shrink-0 place-items-center rounded-full bg-primary/15 font-bold text-[#8a6117]",
                  readyAt ? "size-9 text-[15px]" : "size-12 text-[19px]",
                )}
                aria-hidden="true"
              >
                {who.trim().charAt(0).toUpperCase()}
              </span>
            )
          )}
          <div className="min-w-0">
            <h1
              className={cn(
                "truncate leading-tight",
                readyAt ? "text-[19px] font-semibold tracking-[-0.02em]" : "text-[28px] font-bold tracking-[-0.03em]",
              )}
            >
              {who ? fmt(t.hello, { name: who }) : t.myRound}
            </h1>
            <p className="truncate text-[13.5px] text-muted-foreground">
              {fmt(visits.length === 1 ? t.roundOfOne : t.roundOf, {
                number: initial.number,
                date: f.dayMonth(initial.createdAt),
                count: visits.length,
              })}
            </p>
          </div>
        </div>
        {readyAt && <BigClock since={readyAt} startedLabel={fmt(t.running, { time: f.time(readyAt) })} />}
        {readyAt && (
          <RoundProgress
            segments={visits.map((machine) => ({ id: machine.id, state: segmentOf(machine.id) }))}
            remaining={openStops.map((machine) => machine.id)}
            from={lastDone?.machineId ?? "start"}
            since={lastDone?.at ?? readyAt}
            times={times}
          />
        )}
        {/* This round's own note first, then what the operator says before every round. */}
        {(initial.notes || initial.settings.message) && (
          <div className="mt-3 flex gap-3 rounded-2xl bg-primary/10 px-4 py-3">
            <MessageSquareText className="mt-0.5 size-5 shrink-0 text-[#8a6117]" aria-hidden="true" />
            <div className="flex min-w-0 flex-col gap-1.5">
              <p className="text-[13px] font-semibold text-[#8a6117]">{t.messageTitle}</p>
              {initial.notes && <p className="whitespace-pre-wrap text-[15px] leading-snug">{initial.notes}</p>}
              {initial.settings.message && <p className="whitespace-pre-wrap text-[15px] leading-snug">{initial.settings.message}</p>}
            </div>
          </div>
        )}
      </div>

      {/* The route as a line with a stop for every step: done in green, the
          one to do now in black, the rest still ahead, the drive in between. */}
      <h2 className="px-5 pt-6 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.routeTitle}</h2>
      <div className="flex flex-1 flex-col overflow-y-auto px-3 pb-44 pt-3">
        <ol className="flex flex-col">
          {steps.map((step, index) => {
            const last = index === steps.length - 1;
            const passed = step.state === "done" || step.state === "skipped";
            const next = steps[index + 1];
            const nextPassed = next?.state === "done" || next?.state === "skipped";
            const drive = !last && next.state !== "full" && !nextPassed ? driveInto(index + 1) : null;
            // The line past a full machine turns green with the stop after it.
            const lineDone = passed || (step.state === "full" && nextPassed);
            return (
              <li key={step.key} className="flex gap-3">
                <div className="flex w-10 shrink-0 flex-col items-center pt-[18px]" aria-hidden="true">
                  <span
                    className={cn(
                      "relative grid size-10 shrink-0 place-items-center rounded-full text-[15px] font-bold",
                      step.state === "done" && "bg-positive text-background",
                      step.state === "skipped" && "bg-warning/25 text-foreground",
                      step.state === "now" && "bg-foreground text-background ring-4 ring-foreground/12",
                      step.state === "later" && "border-2 border-border bg-card text-muted-foreground",
                      step.state === "full" && "border-2 border-dashed border-border bg-background text-muted-foreground/70",
                    )}
                  >
                    {step.state === "done" ? <Check className="size-5" strokeWidth={3} /> : index + 1}
                  </span>
                  {!last && <span className={cn("-mb-[18px] w-[3px] flex-1 rounded-full", lineDone ? "bg-positive" : "bg-border")} />}
                </div>
                <div className="flex min-w-0 flex-1 flex-col pb-2">
                  <button
                    type="button"
                    disabled={!step.onOpen}
                    onClick={step.onOpen}
                    className={cn(
                      "flex min-h-[76px] w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-[transform,background-color] active:scale-[0.99]",
                      step.state === "now"
                        ? "bg-card shadow-[0_0_0_2px_var(--foreground)]"
                        : step.state === "full"
                          ? "border-2 border-dashed border-border bg-transparent"
                          : "bg-card/70",
                    )}
                  >
                    {step.machine && (
                      <MachineThumb
                        path={step.machine.photoPath}
                        // Only the picture fades for what comes later: faded text would no longer read outdoors.
                        className={cn("size-12 rounded-xl", (passed || step.state === "full" || step.state === "later") && "opacity-60")}
                      />
                    )}
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className={cn("truncate text-[16.5px] font-semibold", (passed || step.state === "full") && "text-muted-foreground")}>
                        {step.title}
                      </span>
                      <span className={cn("text-[13.5px] text-muted-foreground", step.state === "full" ? "font-medium leading-snug" : "truncate")}>
                        {step.sub}
                      </span>
                    </span>
                    {/* Not for a full one: it was full when the round was made, and sales since would contradict the word. */}
                    {step.machine && !passed && step.state !== "full" && <FillPill fill={fillOf(step.machine.id)} compact />}
                    {step.aside ? (
                      <span className="shrink-0 text-[13px] font-semibold text-muted-foreground">{step.aside}</span>
                    ) : step.state === "now" && !step.machine ? (
                      <span className="shrink-0 rounded-full bg-foreground px-2.5 py-1 text-[12px] font-bold text-background">{t.now}</span>
                    ) : step.onOpen ? (
                      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                    ) : null}
                  </button>
                  {drive && (
                    <p className="flex items-center gap-2 px-1 pb-1 pt-2.5 text-[13px] font-medium text-muted-foreground">
                      <Truck className="size-4" aria-hidden="true" />
                      {drive}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        {/* The round can go (Xin, 19-10-2026): quiet, at the end of the route. */}
        {canDelete && (
          <button type="button" className={cn(ghost, "mt-4 gap-2 text-negative")} onClick={() => setDeleteAsk(true)}>
            <Trash2 className="size-4" aria-hidden="true" />
            {t.deleteRound}
          </button>
        )}
      </div>

      {deleteAsk && (
        <Sheet onClose={() => setDeleteAsk(false)}>
          <h2 className="text-[22px] font-bold tracking-[-0.02em]">{t.deleteTitle}</h2>
          <p className="text-[15.5px] text-muted-foreground">
            {doneCount === 0 ? t.deleteHint : fmt(doneCount === 1 ? t.deleteHintStartedOne : t.deleteHintStarted, { n: doneCount })}
          </p>
          <button type="button" className={cn(primary, "bg-negative")} disabled={pending} onClick={removeRound}>
            {pending ? t.sending : t.deleteConfirm}
          </button>
          <button type="button" className={ghost} onClick={() => setDeleteAsk(false)}>
            {t.back}
          </button>
        </Sheet>
      )}

      <BottomBar>
        {failedMachine && (
          <p className="mb-1.5 flex items-start gap-2 rounded-2xl bg-negative/10 px-4 py-3 text-[15px] font-semibold text-negative">
            <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            {fmt(t.stopFailed, { machine: failedMachine.name })}
          </p>
        )}
        {pendingMachine && countdown !== null && (
          <StopToast
            key={pendingMachine.id}
            machine={pendingMachine.name}
            skipped={pendingSkip}
            left={openStops.length}
            cheer={Object.values(stops).filter((stop) => stop.completedAt && !stop.skipped).length}
            onUndo={undoFinish}
          />
        )}
        {!readyAt ? (
          <button type="button" className={primary} onClick={() => setView("pick")}>
            {touched ? t.continuePicking : t.beginPicking}
          </button>
        ) : nextStop ? (
          <div className="flex gap-2">
            <NavigateButton address={samePlace(hereAddress, nextStop.address) ? null : nextStop.address} place={nextStop.name} />
            <button type="button" className={cn(primary, "min-w-0 flex-1")} disabled={pending || settling} onClick={() => openStop(nextStop.id)}>
              <span className="truncate">{fmt(t.goTo, { machine: nextStop.name })}</span>
              <ChevronRight className="size-5 shrink-0" />
            </button>
          </div>
        ) : (
          // Every machine done: the round closes with one tap; what came back goes back to stock.
          <div className="flex gap-2">
            <NavigateButton address={initial.settings.depotAddress} place={t.stepBackStart} />
            <button
              type="button"
              className={cn(primary, "min-w-0 flex-1")}
              disabled={pending || settling || countdown !== null || pendingId !== null}
              onClick={finishRound}
            >
              {pending ? t.sending : t.finishRound}
            </button>
          </div>
        )}
      </BottomBar>
    </Screen>
  );
}

/** The round's slots of one machine as rows, left to right, for the drawing. */
function slotRows(slots: RefillRound["slots"]): FrontSlot[][] {
  const rows = new Map<number, FrontSlot[]>();
  for (const slot of [...slots].sort((a, b) => a.row - b.row || a.slot - b.slot)) {
    rows.set(slot.row, [
      ...(rows.get(slot.row) ?? []),
      {
        key: slot.selection,
        selection: slot.selection,
        size: "small",
        capacity: slot.capacity,
        stock: slot.stock,
        productName: slot.productName,
        photoUrl: null,
      },
    ]);
  }
  return [...rows.values()];
}

/** The machine's photo, small: what the filler looks for in the car park. */
function MachineThumb({ path, className }: { path: string | null; className?: string }) {
  const url = mediaUrl(path);
  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden bg-[linear-gradient(160deg,#f6f2ea,#ece6da)] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.04)]",
        className,
      )}
      aria-hidden="true"
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={DEFAULT_MACHINE_PHOTO} alt="" className="absolute inset-0 size-full object-contain p-[12%]" />
      )}
    </span>
  );
}

/** How full a machine still is: red under 30%, orange under 60%, green above; grey "?" when never counted. */
function FillPill({ fill, compact = false }: { fill: { percent: number; band: FillBand } | null; compact?: boolean }) {
  const { m } = useI18n();
  const label = fill ? fmt(m.round.fillLeft, { n: fill.percent }) : m.round.fillUnknown;
  return (
    <span
      className={cn(
        "tabular inline-flex shrink-0 items-center gap-1.5 rounded-full font-bold",
        compact ? "h-8 px-2.5 text-[14px]" : "mt-1 h-7 w-fit px-2.5 text-[13.5px]",
        fill ? cn(bandBg[fill.band], "text-white") : "bg-surface text-muted-foreground",
      )}
      title={label}
      aria-label={label}
    >
      {fill ? `${fill.percent}%` : compact ? "?" : m.round.fillUnknown}
      {!compact && fill && <span className="font-semibold opacity-90">{m.round.fillWord}</span>}
    </span>
  );
}

/** A round checkbox, big enough for a thumb in a cold van. It pops when it is set. */
function Tick({ done }: { done: boolean }) {
  return (
    <span
      key={done ? "on" : "off"}
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full border-2 transition-colors",
        done ? "pop border-positive bg-positive text-background" : "border-border bg-card",
      )}
      aria-hidden="true"
    >
      {done && <Check className="size-[18px]" strokeWidth={3.2} />}
    </span>
  );
}

/**
 * A slot's pieces as a bar, one part per piece: every tap fills the next part,
 * and the whole bar turns green once the slot has what it needs. Typed below
 * that, it stays orange. Over a dozen pieces the parts become one bar.
 */
function TapBar({ n, of, tone }: { n: number; of: number; tone: "busy" | "done" | "fewer" }) {
  const fill = tone === "done" ? "bg-positive" : tone === "fewer" ? "bg-warning" : "bg-foreground";
  if (of > 12) {
    return (
      <span className="block h-2 overflow-hidden rounded-full bg-foreground/10" aria-hidden="true">
        <span className={cn("block h-full rounded-full transition-[width] duration-200", fill)} style={{ width: `${Math.min(100, (n / of) * 100)}%` }} />
      </span>
    );
  }
  return (
    <span className="flex gap-1" aria-hidden="true">
      {Array.from({ length: of }, (_, i) => (
        <span key={i} className={cn("h-2 flex-1 rounded-full transition-colors duration-200", i < n ? fill : "bg-foreground/10")} />
      ))}
    </span>
  );
}

/** The product's own photo, when it has one: a picture is found faster than a name. */
function ProductPhoto({ path }: { path: string | null }) {
  const src = mediaUrl(path);
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" loading="lazy" className="size-9 shrink-0 rounded-lg bg-surface object-cover" />;
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
    <div className="mt-3 flex items-center gap-2.5 rounded-2xl bg-foreground px-4 py-2.5 text-background">
      <Timer className="size-5 shrink-0" strokeWidth={2.2} aria-hidden="true" />
      {/* Until the phone has read its own clock, the space is kept but nothing is shown: never a false 0:00:00. */}
      <span className={cn("tabular text-[28px] font-bold leading-none tracking-[-0.03em]", now === null && "invisible")}>
        {`${h}:${mm}:${ss}`}
      </span>
      <span className="ml-auto text-right text-[12.5px] font-medium opacity-80">{startedLabel}</span>
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
    <main className="show-numbers mx-auto flex min-h-svh w-full max-w-md flex-col bg-background">
      <div className={cn("flex flex-1 flex-col", padded && "px-4 pb-7 pt-4")}>{children}</div>
    </main>
  );
}

function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-md flex-col gap-1.5 px-4 pb-4 pt-3">{children}</div>
    </div>
  );
}

/** "Terug", next to the big button at every step: one step back, nothing lost. */
function BackButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  const { m } = useI18n();
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cn(outline, "w-auto shrink-0 gap-1 pl-3 pr-4 disabled:opacity-50")}>
      <ChevronLeft className="size-5" aria-hidden="true" />
      {m.round.back}
    </button>
  );
}

/** "Welke gerechten zijn over datum?": the machine's dishes, each with − and +, then the machine is done. */
function ExpiredPick({
  slots,
  counts,
  doneLabel,
  onChange,
  onDone,
  onBack,
  onClose,
}: {
  slots: RefillRound["slots"];
  counts: Record<string, number>;
  doneLabel: string;
  onChange: (selection: string, n: number) => void;
  onDone: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const { m } = useI18n();
  const t = m.round;
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  return (
    <Sheet onClose={onClose}>
      <h2 className="text-[22px] font-bold tracking-[-0.02em]">{t.expiredPickTitle}</h2>
      <p className="text-[15px] text-muted-foreground">{t.expiredPickHint}</p>
      <ul className="flex flex-col">
        {slots.map((slot) => {
          const n = counts[slot.selection] ?? 0;
          return (
            <li key={slot.selection} className="flex min-h-[60px] items-center gap-2.5 border-b border-border/60 last:border-0">
              <span className="min-w-8 rounded-lg bg-surface px-1.5 py-0.5 text-center font-mono text-[12.5px] font-semibold">{slot.selection}</span>
              <span className={cn("min-w-0 flex-1 truncate text-[15.5px] font-semibold", n > 0 && "text-negative")}>{slot.productName}</span>
              <button type="button" className={stepper} disabled={n === 0} onClick={() => onChange(slot.selection, n - 1)} aria-label={`− ${slot.selection}`}>
                −
              </button>
              <span className="tabular w-7 text-center text-[19px] font-bold">{n}</span>
              <button
                type="button"
                className={stepper}
                disabled={n >= slot.capacity}
                onClick={() => {
                  haptic();
                  onChange(slot.selection, n + 1);
                }}
                aria-label={`+ ${slot.selection}`}
              >
                +
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" className={primary} disabled={total === 0} onClick={onDone}>
        <Check className="size-5" strokeWidth={3} aria-hidden="true" />
        <span className="truncate">{doneLabel}</span>
      </button>
      <button type="button" className={ghost} onClick={onBack}>
        {t.back}
      </button>
    </Sheet>
  );
}

/** "Waze": the way to an address, on a phone in the Waze app (Xin, 19-10-2026). Nothing without an address. */
function NavigateButton({ address, place }: { address: string | null; place: string }) {
  const { m } = useI18n();
  const href = wazeLink(address);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={fmt(m.round.navigateTo, { place })}
      className={cn(outline, "w-auto shrink-0 gap-1.5 px-4")}
    >
      <Navigation className="size-5 text-[#05c8f7]" aria-hidden="true" />
      {m.round.waze}
    </a>
  );
}

/** "Stop 2 of 5" between two arrows: the machine before and after it on the route (Xin, 19-10-2026). */
function StopNav({ label, onPrev, onNext }: { label: string; onPrev?: () => void; onNext?: () => void }) {
  const { m } = useI18n();
  const arrow = "grid size-11 shrink-0 place-items-center rounded-full bg-surface active:scale-95 disabled:opacity-30";
  return (
    <div className="mt-1 flex items-center gap-2">
      <button type="button" className={arrow} onClick={onPrev} disabled={!onPrev} aria-label={m.round.prevMachine}>
        <ChevronLeft className="size-5" aria-hidden="true" />
      </button>
      <p className="tabular min-w-0 flex-1 text-center text-[14px] font-semibold text-muted-foreground">{label}</p>
      <button type="button" className={arrow} onClick={onNext} disabled={!onNext} aria-label={m.round.nextMachine}>
        <ChevronRight className="size-5" aria-hidden="true" />
      </button>
    </div>
  );
}

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  // A keyboard or screen reader lands in the sheet, Escape closes it, and focus goes back where it was.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      before?.focus?.();
    };
  }, []);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-foreground/35" onClick={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="flex max-h-[92svh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-[28px] bg-card px-5 pb-[calc(1.75rem+env(safe-area-inset-bottom))] pt-3 outline-none"
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
  only,
  startFor,
  onClose,
  onSave,
}: {
  slots: RefillRound["slots"];
  preset: string | null;
  /** Opened for one kind only ("Over datum"): no choice of kind, straight to the slot and the number. */
  only?: ReportKind;
  /** Where the stepper starts for a kind of report on a slot: what is noted already, or what Vendly expects. */
  startFor: (kind: ReportKind, selection: string | null) => number;
  onClose: () => void;
  onSave: (kind: ReportKind, selection: string | null, value: number, note: string | null) => void;
}) {
  const { m } = useI18n();
  const t = m.round;
  const [kind, setKind] = useState<ReportKind>(only ?? "expired");
  const [selection, setSelection] = useState<string | null>(preset);
  const [value, setValue] = useState(() => startFor(only ?? "expired", preset));
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
      <h2 className="text-[22px] font-bold tracking-[-0.02em]">{only === "expired" ? t.expiredTitle : t.whatIsIt}</h2>
      {!only && (
        <div className="flex flex-wrap gap-2">
          {kinds.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={kind === option.id}
              onClick={() => {
                setKind(option.id);
                setValue(startFor(option.id, selection));
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
      )}

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
          {/* The machine as the filler sees it, each slot with what Vendly thinks is in it. */}
          <FrontView
            rows={slotRows(slots)}
            selectedKey={selection}
            onSlotClick={(picked) => {
              setSelection(picked.selection);
              setValue(startFor(kind, picked.selection));
            }}
          />
          {slot && (
            <p className="text-[15px] font-semibold">
              {fmt(t.slotPicked, { slot: slot.selection, product: slot.productName ?? m.common.unknown })}
              <span className="font-normal text-muted-foreground">
                {" · "}
                {slot.stock === null ? t.notCountedShort : fmt(t.nowOfShort, { n: slot.stock, cap: slot.capacity })}
              </span>
            </p>
          )}
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
