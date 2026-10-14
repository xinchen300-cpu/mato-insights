"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Timer } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import type { OpenRound } from "@/lib/data";
import { cn } from "@/lib/utils";

/**
 * Rounds that are out right now, for the operator: who is filling, a clock
 * that runs from their "Start ronde", which machine they are at and which are
 * done. The page refreshes itself while a round is out, so the operator never
 * has to reload to see the filler move on.
 */
export function LiveRounds({
  rounds,
  link = "detail",
}: {
  rounds: OpenRound[];
  /** Where a card leads: the round's page, or straight into filling it. */
  link?: "detail" | "fill";
}) {
  const { m, f } = useI18n();
  const t = m.refill;
  const router = useRouter();
  const live = rounds.some((round) => round.readyAt);

  useEffect(() => {
    if (!live) return;
    const every = setInterval(() => router.refresh(), 20_000);
    return () => clearInterval(every);
  }, [live, router]);

  if (rounds.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="px-1 text-[20px] font-semibold tracking-[-0.02em]">{t.liveTitle}</h2>
      {rounds.map((round) => {
        const done = round.machines.filter((mc) => mc.done);
        const current = round.machines.find((mc) => !mc.done) ?? null;
        const last = [...done].filter((mc) => mc.doneAt).sort((a, b) => (a.doneAt! < b.doneAt! ? 1 : -1))[0] ?? null;
        return (
          <Link
            key={round.id}
            href={link === "fill" ? `/vullen/${round.id}` : `/refill/${round.id}`}
            className="surface-card flex flex-col gap-4 p-5 transition-transform active:scale-[0.995] sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="relative flex size-3 shrink-0" aria-hidden="true">
                  {round.readyAt && <span className="absolute inline-flex size-full animate-ping rounded-full bg-positive opacity-60" />}
                  <span className={cn("relative inline-flex size-3 rounded-full", round.readyAt ? "bg-positive" : "bg-warning")} />
                </span>
                <span className="min-w-0 truncate text-[17px] font-semibold">
                  {round.readyAt
                    ? fmt(t.liveFilling, { name: round.filledBy ?? t.liveSomeone })
                    : fmt(round.machines.length === 1 ? t.livePackingOne : t.livePacking, { count: round.machines.length })}
                </span>
              </div>
              <ChevronRight className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            </div>

            {round.readyAt && (
              <div className="flex items-end justify-between gap-4">
                <LiveClock since={round.readyAt} />
                <span className="pb-1 text-right text-[13.5px] text-muted-foreground">
                  {fmt(t.liveStarted, { time: f.time(round.readyAt) })}
                </span>
              </div>
            )}

            <div className="flex gap-1.5" aria-hidden="true">
              {round.machines.map((mc) => (
                <span
                  key={mc.id}
                  className={cn(
                    "h-1.5 flex-1 rounded-full",
                    mc.skipped ? "bg-warning" : mc.done ? "bg-positive" : mc.id === current?.id && round.readyAt ? "bg-foreground" : "bg-border",
                  )}
                />
              ))}
            </div>

            <div className="flex flex-col gap-1 text-[14.5px]">
              <span className="font-semibold">
                {fmt(t.liveProgress, { done: done.length, total: round.machines.length })}
                {current && round.readyAt ? ` · ${fmt(t.liveNow, { machine: current.name })}` : ""}
              </span>
              {last?.doneAt && (
                <span className="text-muted-foreground">
                  {fmt(last.skipped ? t.liveLastSkipped : t.liveLastDone, { machine: last.name, time: f.time(last.doneAt) })}
                </span>
              )}
            </div>
          </Link>
        );
      })}
    </section>
  );
}

/** Hours, minutes and seconds since the start, ticking. */
function LiveClock({ since }: { since: string }) {
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
    <span className="tabular flex items-center gap-2 text-[36px] font-semibold leading-none tracking-[-0.035em]">
      <Timer className="size-6 text-muted-foreground" strokeWidth={2.2} aria-hidden="true" />
      {now === null ? "0:00:00" : `${h}:${mm}:${ss}`}
    </span>
  );
}
