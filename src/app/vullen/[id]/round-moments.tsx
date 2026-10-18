"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, Medal, TriangleAlert } from "lucide-react";
import { RollingNumber } from "@/components/motion/rolling-number";
import { SuccessCheck } from "@/components/motion/success";
import { useI18n } from "@/i18n/client";
import { duration, fmt } from "@/i18n/format";
import type { RouteTimes } from "@/lib/data";
import { progressFrame, roundEta, type RoundReward } from "@/lib/filler-stats";
import { MIN_ROUNDS } from "@/lib/stats";
import { cn } from "@/lib/utils";
import { ghost, primary } from "./styles";

// The moments of a round that should feel like something: how far along it is,
// a machine done, and the end. Each one states a fact (done, left, a time) and
// nothing that pushes: no red, no "too slow", no colleague to beat. What makes
// people go a little quicker is seeing the end come closer, not being chased.

export type SegmentState = "done" | "skipped" | "now" | "later";

/** Now, every half minute: enough for an estimate in minutes, without a render every second. */
function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const every = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, []);
  return now;
}

/**
 * The round as one segment per machine, filling as they are done. Before
 * halfway it says what is done, from halfway what is left: the smaller number
 * is the one that pulls (see progressFrame). The estimate on the right shows
 * only when earlier rounds measured every drive and machine still ahead.
 */
export function RoundProgress({
  segments,
  remaining,
  from,
  since,
  times,
}: {
  segments: { id: string; state: SegmentState }[];
  /** Machines still to do, in the order of the round. */
  remaining: string[];
  /** Where the filler was last done, and when: a machine, or "start" and the start of the round. */
  from: string;
  since: string;
  times: RouteTimes;
}) {
  const { m, f } = useI18n();
  const t = m.round;
  const now = useNow();
  const total = segments.length;
  const done = segments.filter((s) => s.state === "done" || s.state === "skipped").length;
  const left = total - done;
  const eta = now === null || left === 0 ? null : roundEta({ remaining, from, since, times, now });
  return (
    <div className="mt-3 flex flex-col gap-2.5 rounded-2xl bg-card px-4 py-3.5 ring-1 ring-border">
      <div className="flex gap-1.5" aria-hidden="true">
        {segments.map((segment) => (
          <span key={segment.id} className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface">
            <span
              className={cn(
                "bar-grow block h-full rounded-full",
                segment.state === "done" && "bg-positive",
                segment.state === "skipped" && "bg-warning/50",
                segment.state === "now" && "now-pulse bg-foreground/20",
              )}
              style={{ transform: `scaleX(${segment.state === "later" ? 0 : 1})` }}
            />
          </span>
        ))}
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[15px] font-semibold">
          {left === 0
            ? t.allMachinesDone
            : progressFrame(done, total) === "done"
              ? fmt(t.progressDone, { n: done, total })
              : fmt(t.progressLeft, { n: left })}
        </p>
        {eta !== null && (
          <p className="shrink-0 text-[13.5px] font-medium text-muted-foreground" title={t.etaHint}>
            {fmt(t.etaLabel, { time: f.time(new Date(eta)) })}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * A machine just done (or skipped): a tick that draws itself, a word of
 * encouragement and what is left, and three seconds to take it back, shown
 * by a line that runs out.
 */
export function StopToast({
  machine,
  skipped,
  left,
  cheer,
  onUndo,
}: {
  machine: string;
  skipped: boolean;
  /** Machines still to do after this one. */
  left: number;
  /** Which of the encouragements, so they take turns. */
  cheer: number;
  onUndo: () => void;
}) {
  const { m } = useI18n();
  const t = m.round;
  const cheers = [t.cheer1, t.cheer2, t.cheer3, t.cheer4];
  return (
    <div
      role="status"
      className={cn(
        "rise relative mb-1.5 flex items-center justify-between gap-3 overflow-hidden rounded-2xl py-2 pl-3 pr-1.5",
        skipped ? "bg-warning/15" : "bg-positive/12",
      )}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        {skipped ? (
          <TriangleAlert className="size-6 shrink-0 text-warning" aria-hidden="true" />
        ) : (
          <SuccessCheck variant="line" className="size-7" />
        )}
        <span className="flex min-w-0 flex-col">
          <span className="line-clamp-2 text-[15px] font-semibold leading-snug">
            {fmt(skipped ? t.stopSkippedToast : t.stopDoneToast, { machine })}
          </span>
          {!skipped && (
            <span className="text-[13px] leading-snug text-muted-foreground">
              {cheers[cheer % cheers.length]} {left === 0 ? t.allMachinesDone : fmt(t.progressLeft, { n: left })}
            </span>
          )}
        </span>
      </span>
      <button
        type="button"
        className="h-11 shrink-0 rounded-xl bg-card px-4 text-[15px] font-semibold ring-1 ring-border"
        onClick={onUndo}
      >
        {t.undo}
      </button>
      <span className="drain absolute inset-x-0 bottom-0 h-[3px] bg-foreground/15" aria-hidden="true" />
    </div>
  );
}

/**
 * The end of a round: the time rolling in, what it amounted to, and what it
 * earned. A record and a new level get a few sparks; "faster than usual" only
 * appears when stats.ts says it is more than an ordinary swing, and a slower
 * round is simply not commented on.
 */
export function RoundDone({
  reward,
  minutes,
  summary,
  tomorrow = [],
}: {
  reward: RoundReward | null;
  minutes: number | null;
  summary: string;
  /** What the box was short of and the slots missed: for the kitchen and the next round. */
  tomorrow?: { productId: string; name: string; n: number }[];
}) {
  const { m, f } = useI18n();
  const t = m.round;
  const time = (n: number) => duration(n, m.refill.runTime, m.refill.runTimeHours);
  const levelUp = reward !== null && reward.after.level > reward.before.level;
  const until = reward && reward.result.complete && reward.earlierOnRoute < MIN_ROUNDS ? MIN_ROUNDS - reward.earlierOnRoute : 0;
  // The cards come in one after the other, after the tick has drawn.
  let order = 4;
  const next = () => ({ "--i": order++ }) as React.CSSProperties;

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-col items-center gap-2 pt-6 text-center">
        <SuccessCheck sparks={Boolean(reward?.record || levelUp)} className="size-20" />
        <h1 className="mt-3 text-[30px] font-bold tracking-[-0.03em]">{t.roundDone}</h1>
        {minutes !== null && (
          <p className="tabular text-[46px] font-bold leading-none tracking-[-0.04em]">
            <RollingNumber value={time(minutes)} />
          </p>
        )}
        <p className="mt-1 max-w-[34ch] text-[15px] text-muted-foreground">{summary}</p>
      </div>

      {reward && (
        <div className="mt-7 flex flex-col gap-2.5">
          {reward.record ? (
            <div className="rise flex items-center gap-3.5 rounded-2xl bg-primary/10 px-4 py-3.5" style={next()}>
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-b from-[#f6e8c8] to-[#e6cd94] text-[#76500f]">
                <Medal className="size-6" aria-hidden="true" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-[16px] font-semibold">{t.recordTitle}</span>
                {reward.previousBest !== null && (
                  <span className="text-[13.5px] text-foreground/70">{fmt(t.recordSub, { time: time(reward.previousBest) })}</span>
                )}
              </span>
            </div>
          ) : reward.verdict === "faster" && reward.usual !== null ? (
            <p className="rise rounded-2xl bg-positive/10 px-4 py-3.5 text-[15px] font-semibold text-positive" style={next()}>
              {fmt(t.fasterThanUsual, { time: time(reward.usual) })}
            </p>
          ) : reward.verdict === "usual" ? (
            <p className="rise rounded-2xl bg-surface px-4 py-3.5 text-[15px] text-muted-foreground" style={next()}>
              {t.usualPace}
            </p>
          ) : until > 0 ? (
            <p className="rise rounded-2xl bg-surface px-4 py-3.5 text-[15px] text-muted-foreground" style={next()}>
              {until === 1 ? t.roundsUntilBestOne : fmt(t.roundsUntilBest, { n: until })}
            </p>
          ) : null}

          <div className="rise surface-card flex flex-col gap-2.5 px-4 py-4" style={next()}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[16px] font-semibold">
                {levelUp ? fmt(t.levelUp, { n: reward.after.level }) : fmt(m.me.level, { n: reward.after.level })}
              </span>
              <span className="tabular text-[15px] font-bold text-positive">{fmt(t.itemsGained, { n: f.number(reward.result.items) })}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-surface">
              <div
                className="bar-fill h-full rounded-full bg-primary"
                style={{ "--from": levelUp ? 0 : reward.before.progress, "--to": reward.after.progress } as React.CSSProperties}
              />
            </div>
            <p className="tabular text-[13.5px] text-muted-foreground">
              {fmt(m.me.toNext, { n: f.number(reward.after.to - reward.after.items), level: reward.after.level + 1 })}
            </p>
          </div>

        </div>
      )}

      {/* Written down for tomorrow, so it is not on a scrap of paper (Xin, 18-10-2026). A fact, not a fault: no red. */}
      {tomorrow.length > 0 && (
        <section className="rise mt-7 flex flex-col gap-3 rounded-2xl bg-surface px-4 py-4" style={next()}>
          <h2 className="flex items-center gap-2.5 text-[17px] font-bold">
            <ClipboardList className="size-5 shrink-0" aria-hidden="true" />
            {t.bringTomorrow}
          </h2>
          <p className="-mt-1.5 text-[14px] text-muted-foreground">{t.bringTomorrowHint}</p>
          <ul className="flex flex-col gap-2">
            {tomorrow.map((item) => (
              <li key={item.productId} className="flex items-baseline gap-3 text-[16px]">
                <span className="tabular w-[30px] shrink-0 text-right font-bold">{item.n}</span>
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-auto flex flex-col gap-1.5 pt-8">
        <Link href="/refill/me" className={primary}>
          {t.seeStats}
        </Link>
        <Link href="/refill" className={ghost}>
          {t.toStart}
        </Link>
      </div>
    </div>
  );
}

/** Pieces in at this machine of the pieces that go in; "all" once every slot is done. */
export function SlotProgress({ done, total, all }: { done: number; total: number; all: boolean }) {
  const { m } = useI18n();
  return (
    <div className="mt-2 flex items-center gap-3">
      <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface" aria-hidden="true">
        <span
          className={cn("bar-grow block h-full rounded-full", all ? "bg-positive" : "bg-foreground")}
          style={{ transform: `scaleX(${all ? 1 : total ? done / total : 0})` }}
        />
      </span>
      <span className={cn("tabular shrink-0 text-[14px] font-semibold", all && "text-positive")}>
        {all ? m.round.allIn : fmt(m.round.piecesProgress, { n: done, total })}
      </span>
    </div>
  );
}
