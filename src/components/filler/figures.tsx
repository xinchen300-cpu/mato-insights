"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, Medal, PackageOpen, Pencil, Route, TriangleAlert, Undo2 } from "lucide-react";
import { Avatar, ListRow, RowList } from "@/components/list-row";
import { MachineIcon } from "@/components/machine/machine-icon";
import { ProgressRing } from "@/components/motion/success";
import { RollingNumber } from "@/components/motion/rolling-number";
import { EmptyState, Section } from "@/components/page-header";
import { useI18n } from "@/i18n/client";
import { duration, fmt } from "@/i18n/format";
import type { AvatarLook } from "@/lib/avatar";
import type { FillerStats } from "@/lib/filler-stats";
import { MIN_ROUNDS } from "@/lib/stats";
import { cn } from "@/lib/utils";
import { FillerAvatar } from "./avatar";
import { AvatarEditor } from "./avatar-editor";

// A filler's own scoreboard. It reads a little like a game (a level, records)
// but speaks like the rest of the app: calm, factual, and only about their own
// work. Times appear per route and only once there are enough rounds on it for
// "best" and "usual" to mean something; nothing is compared with a colleague.

/** The whole page with one's own figures. */
export function FillerFigures({ stats, names, look }: { stats: FillerStats; names: Record<string, string>; look: AvatarLook | null }) {
  const { m, f } = useI18n();
  const t = m.me;
  const time = (minutes: number) => duration(minutes, m.refill.runTime, m.refill.runTimeHours);

  if (stats.rounds === 0) {
    return (
      <div className="flex flex-col gap-6">
        {/* The avatar can be made before the first round. */}
        <LevelCard stats={stats} look={look} />
        <EmptyState title={t.emptyTitle} hint={t.emptyHint} icon={<Medal className="size-5" />} />
        <HowItWorks />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <LevelCard stats={stats} look={look} />
        <div className="grid grid-cols-3 gap-3">
          <Figure label={t.rounds} value={f.number(stats.rounds)} />
          <Figure label={t.machines} value={f.number(stats.visits)} />
          <Figure label={t.weekItems} value={f.number(stats.week.items)} />
        </div>
        {/* Records: the one thing here that is about speed, and earned, not counted. */}
        <div className="surface-card flex items-center gap-4 p-5">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-gradient-to-b from-[#f6e8c8] to-[#e6cd94] text-[#76500f]">
            <Medal className="size-6" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15.5px] font-semibold">{t.recordsTitle}</p>
            <p className="mt-0.5 text-[13.5px] text-muted-foreground">
              {stats.lastRecord
                ? fmt(t.recordsLast, { time: time(stats.lastRecord.minutes), date: f.dayMonth(stats.lastRecord.at) })
                : stats.records === 0
                  ? t.recordsNone
                  : t.recordsHint}
            </p>
          </div>
          <span className="tabular text-[34px] font-bold leading-none tracking-[-0.04em]">{stats.records}</span>
        </div>
      </section>

      {stats.routes.length > 0 && (
        <Section title={t.routesTitle}>
          <RowList>
            {stats.routes.slice(0, 6).map((route) => {
              const known = route.rounds >= MIN_ROUNDS && route.best !== null;
              const until = MIN_ROUNDS - route.rounds;
              return (
                <li key={route.route}>
                  <ListRow
                    leading={
                      <Avatar tone={known ? "gold" : "neutral"}>
                        <Route />
                      </Avatar>
                    }
                    title={route.machineIds.map((id) => names[id] ?? "—").join(" · ")}
                    subtitle={
                      known && route.usual !== null
                        ? `${fmt(t.routeRounds, { n: route.rounds })} · ${fmt(t.routeUsual, { time: time(route.usual) })}`
                        : until === 1
                          ? t.routeUntilBestOne
                          : fmt(t.routeUntilBest, { n: until })
                    }
                    value={known ? fmt(t.routeBest, { time: time(route.best as number) }) : undefined}
                  />
                </li>
              );
            })}
          </RowList>
        </Section>
      )}

      <Section title={t.recentTitle}>
        <RowList>
          {stats.recent.map((round) => (
            <li key={round.id}>
              <ListRow
                leading={
                  <Avatar tone={round.record ? "gold" : round.complete ? "positive" : "warning"}>
                    {round.record ? <Medal /> : round.complete ? <Check /> : <TriangleAlert />}
                  </Avatar>
                }
                title={f.dateTime(round.completedAt)}
                subtitle={[
                  fmt(round.visited === 1 ? t.recentSubOne : t.recentSub, { machines: round.visited, items: f.number(round.items) }),
                  ...(round.skipped ? [fmt(t.skippedTag, { n: round.skipped })] : []),
                ].join(" · ")}
                value={round.minutes !== null ? time(round.minutes) : "—"}
                valueSub={round.record ? <span className="font-semibold text-[#8a6117]">{t.recordTag}</span> : undefined}
              />
            </li>
          ))}
        </RowList>
      </Section>
    </div>
  );
}

/** The level as a ring that fills towards the next one, with every piece filled so far. */
function LevelCard({ stats, look }: { stats: FillerStats; look: AvatarLook | null }) {
  const { m, f } = useI18n();
  const t = m.me;
  const [editing, setEditing] = useState(false);
  return (
    <div className="surface-card flex flex-col gap-4 p-5 sm:p-6">
      <div className="flex items-center gap-5">
        <LevelRing stats={stats} look={look} size={104} stroke={9}>
          <span className="flex flex-col items-center leading-none">
            <span className="text-[11.5px] font-semibold text-muted-foreground">{t.levelWord}</span>
            <span className="tabular mt-1 text-[36px] font-bold tracking-[-0.04em] text-foreground">{stats.level.level}</span>
          </span>
        </LevelRing>
        <div className="min-w-0">
          <p className="tabular text-[34px] font-bold leading-none tracking-[-0.04em]">
            <RollingNumber value={f.number(stats.items)} />
          </p>
          <p className="mt-1.5 text-[14.5px] font-medium text-muted-foreground">{t.itemsLabel}</p>
          <p className="tabular mt-3 text-[13.5px] text-muted-foreground">
            {fmt(t.toNext, { n: f.number(stats.level.to - stats.items), level: stats.level.level + 1 })}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex h-11 items-center justify-center gap-2 rounded-full bg-surface text-[14.5px] font-semibold active:scale-[0.99]"
      >
        <Pencil className="size-4" aria-hidden="true" />
        {look ? t.avatarEdit : t.avatarMake}
      </button>
      {editing && <AvatarEditor initial={look} onClose={() => setEditing(false)} />}
    </div>
  );
}

/**
 * The level as a ring that fills towards the next one. With an avatar chosen
 * (Xin, 19-10-2026) the avatar sits in the ring and the level on a badge under
 * it; without one, the ring holds the level as before.
 */
function LevelRing({
  stats,
  look,
  size,
  stroke,
  children,
}: {
  stats: FillerStats;
  look: AvatarLook | null;
  size: number;
  stroke: number;
  children: React.ReactNode;
}) {
  const { m } = useI18n();
  const inner = size - stroke * 2 - 4;
  return (
    <span className="relative shrink-0">
      <ProgressRing value={stats.level.progress} size={size} stroke={stroke} className="text-primary">
        {look ? (
          <span className="block overflow-hidden rounded-full bg-primary/12" style={{ width: inner, height: inner }}>
            <FillerAvatar look={look} className="size-full" />
          </span>
        ) : (
          children
        )}
      </ProgressRing>
      {look && (
        <span
          className={cn(
            "tabular absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-foreground font-bold text-background shadow-sm",
            size >= 80 ? "-bottom-1.5 px-2.5 py-0.5 text-[12.5px]" : "-bottom-1.5 px-1.5 py-px text-[10.5px]",
          )}
        >
          {fmt(m.me.levelShort, { n: stats.level.level })}
        </span>
      )}
    </span>
  );
}

/** One small figure: a label that may take two lines on a phone, the number under it. */
function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card flex min-w-0 flex-col justify-between gap-2 px-3.5 py-3.5">
      <p className="line-clamp-2 text-[12.5px] font-medium leading-snug text-muted-foreground">{label}</p>
      <p className="tabular truncate text-[22px] font-semibold leading-none tracking-[-0.03em]">{value}</p>
    </div>
  );
}

/**
 * On the filler's home: the level and this week at a glance, one tap from
 * the whole page. Small on purpose: the round itself comes first.
 */
export function FiguresCard({ stats, look }: { stats: FillerStats; look: AvatarLook | null }) {
  const { m, f } = useI18n();
  const t = m.me;
  return (
    <Link
      href="/refill/me"
      className="surface-card hover-surface flex items-center gap-4 p-4 transition-transform duration-150 active:scale-[0.99]"
    >
      <LevelRing stats={stats} look={look} size={56} stroke={5}>
        <span className="tabular text-[19px] font-bold tracking-[-0.03em] text-foreground">{stats.level.level}</span>
      </LevelRing>
      <span className="min-w-0 flex-1">
        <span className="block text-[15.5px] font-semibold">{m.me.title}</span>
        <span className="tabular mt-0.5 block truncate text-[13.5px] text-muted-foreground">
          {fmt(t.cardSub, { level: stats.level.level, items: f.number(stats.items) })}
          {stats.week.rounds > 0 &&
            ` · ${stats.week.rounds === 1 ? t.weekRoundsOne : fmt(t.weekRounds, { n: stats.week.rounds })}`}
        </span>
      </span>
      {stats.records > 0 && (
        <span
          className="flex shrink-0 items-center gap-1 rounded-full bg-primary/12 px-2.5 py-1 text-[13px] font-bold text-[#8a6117]"
          title={t.recordsTitle}
        >
          <Medal className="size-3.5" aria-hidden="true" />
          {stats.records}
        </span>
      )}
      <ChevronRight className="size-5 shrink-0 text-muted-foreground/70" aria-hidden="true" />
    </Link>
  );
}

/** Three pictures and three short lines: the whole round, for someone who never did one. */
export function HowItWorks({ className }: { className?: string }) {
  const { m } = useI18n();
  const t = m.me;
  const steps = [
    { icon: PackageOpen, title: t.howPick, hint: t.howPickHint },
    { icon: MachineIcon, title: t.howFill, hint: t.howFillHint },
    { icon: Undo2, title: t.howBack, hint: t.howBackHint },
  ];
  return (
    <section className={cn("surface-card p-5 sm:p-6", className)}>
      <h2 className="text-[18px] font-semibold tracking-[-0.02em]">{t.howTitle}</h2>
      <ol className="mt-4 grid gap-4 sm:grid-cols-3">
        {steps.map((step, i) => (
          <li key={step.title} className="rise flex items-center gap-3.5" style={{ "--i": i } as React.CSSProperties}>
            <span className="relative grid size-12 shrink-0 place-items-center rounded-2xl bg-surface">
              <step.icon className="size-6" strokeWidth={1.9} aria-hidden="true" />
              <span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-foreground text-[11px] font-bold text-background">
                {i + 1}
              </span>
            </span>
            <span className="min-w-0">
              <span className="block text-[15.5px] font-semibold">{step.title}</span>
              <span className="block text-[13.5px] text-muted-foreground">{step.hint}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
