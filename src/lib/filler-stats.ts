// A filler's own figures, the way a game keeps score: what they did, their best
// time on each route, how far along they are, and what a round that just ended
// earned them. Pure logic without a database, checked by npm run test:flow.
//
// It is all the filler's own: no money, nobody else's times, no ranking. A time
// is only ever held against the same person's earlier rounds on the same
// machines, and only through stats.ts, so a lucky week is never sold as progress.

import type { Average, StopRecord } from "@/lib/refill-flow";
import { compareTimes, isRecord, reportDay, usualTime, type TimeVerdict } from "@/lib/stats";

/**
 * One finished round of the person looking, summed up: the database does that
 * for the earlier rounds (filler_rounds), summarizeRound for the one on the phone.
 */
export type MyRound = {
  id: string;
  readyAt: string;
  completedAt: string;
  /** The machines the round was made for. */
  machineIds: string[];
  /** Machines done and not skipped. */
  visited: number;
  skipped: number;
  /** Pieces that went into the machines that were not skipped. */
  items: number;
};

/** A round with every stop, the way the phone holds it. */
export type RoundWithStops = Pick<MyRound, "id" | "readyAt" | "completedAt" | "machineIds"> & {
  stops: Record<string, StopRecord>;
};

/**
 * A round summed up the way filler_rounds in the database does it, for the
 * round that just ended on the phone and for made-up rounds. The two must
 * count alike, so change them together: a stop is visited when it is done and
 * not skipped, and only stops that were not skipped add their pieces.
 */
export function summarizeRound(round: RoundWithStops): MyRound {
  const stops = Object.values(round.stops ?? {});
  return {
    id: round.id,
    readyAt: round.readyAt,
    completedAt: round.completedAt,
    machineIds: round.machineIds,
    visited: stops.filter((stop) => stop.completedAt && !stop.skipped).length,
    skipped: stops.filter((stop) => stop.skipped).length,
    items: stops
      .filter((stop) => !stop.skipped)
      .reduce((sum, stop) => sum + stop.lines.reduce((s, line) => s + Math.max(0, line.filled), 0), 0),
  };
}

/** What one round amounted to. */
export type RoundResult = {
  id: string;
  completedAt: string;
  /** "Start ronde" to "Afronden"; null when that cannot be right (a round left open overnight). */
  minutes: number | null;
  /** Machines filled. */
  visited: number;
  skipped: number;
  /** Pieces that went into the machines. */
  items: number;
  /** The same machines in any order: a time is only compared on its own route. */
  route: string;
  machineIds: string[];
  /** Every machine done, none skipped: only such a round sets or beats a time. */
  complete: boolean;
};

// The operator's timings use the same ceiling: longer is a clock left running.
const MAX_ROUND_MINUTES = 12 * 60;

export const routeKey = (machineIds: string[]) => [...new Set(machineIds)].sort().join(",");

export function roundResult(round: MyRound): RoundResult {
  const machineIds = [...new Set(round.machineIds)];
  const minutes = (Date.parse(round.completedAt) - Date.parse(round.readyAt)) / 60000;
  return {
    id: round.id,
    completedAt: round.completedAt,
    minutes: minutes > 0 && minutes < MAX_ROUND_MINUTES ? minutes : null,
    visited: round.visited,
    skipped: round.skipped,
    items: round.items,
    route: routeKey(machineIds),
    machineIds,
    complete: machineIds.length > 0 && round.skipped === 0 && round.visited >= machineIds.length,
  };
}

// ── Levels ───────────────────────────────────────────────────────────────────

/** Pieces filled to reach a level: 0, 100, 300, 600, 1000, … each level asks 100 more than the last. */
export const levelStart = (level: number) => 50 * level * (level - 1);

export type Level = {
  level: number;
  items: number;
  /** Pieces where this level began and where the next one starts. */
  from: number;
  to: number;
  /** How far towards the next level, 0 to 1. */
  progress: number;
};

export function levelFor(items: number): Level {
  const total = Math.max(0, Math.floor(items));
  let level = 1;
  while (levelStart(level + 1) <= total) level++;
  const from = levelStart(level);
  const to = levelStart(level + 1);
  return { level, items: total, from, to, progress: (total - from) / (to - from) };
}

// ── Badges ───────────────────────────────────────────────────────────────────

export type BadgeId = "first" | "record" | "rounds10" | "records3" | "machines100" | "items1000" | "rounds50" | "items5000";

type Tally = { rounds: number; visits: number; items: number; records: number };

/**
 * In the order a new filler is likely to earn them. Nothing for rounds without
 * a skip: fillers do not skip machines, so that would only count rounds again.
 * What does vary is speed, so records (beating one's own best on a route) count.
 */
export const BADGES: { id: BadgeId; target: number; measure: (tally: Tally) => number }[] = [
  { id: "first", target: 1, measure: (t) => t.rounds },
  { id: "record", target: 1, measure: (t) => t.records },
  { id: "rounds10", target: 10, measure: (t) => t.rounds },
  { id: "records3", target: 3, measure: (t) => t.records },
  { id: "machines100", target: 100, measure: (t) => t.visits },
  { id: "items1000", target: 1000, measure: (t) => t.items },
  { id: "rounds50", target: 50, measure: (t) => t.rounds },
  { id: "items5000", target: 5000, measure: (t) => t.items },
];

export type Badge = { id: BadgeId; target: number; current: number; earnedAt: string | null };

const oldestFirst = (a: { completedAt: string }, b: { completedAt: string }) => a.completedAt.localeCompare(b.completedAt);

/** Earlier complete rounds on the same route that have a time, oldest first. */
function timesBefore(results: RoundResult[], index: number): number[] {
  const route = results[index].route;
  return results
    .slice(0, index)
    .filter((r) => r.route === route && r.complete && r.minutes !== null)
    .map((r) => r.minutes as number);
}

/** Did this round set a best time on its route? (Only with enough earlier rounds to beat.) */
function setRecord(results: RoundResult[], index: number): boolean {
  const r = results[index];
  return r.complete && r.minutes !== null && isRecord(r.minutes, timesBefore(results, index));
}

/** Everything counted over the rounds, oldest first, with the moment each badge was earned. */
function walk(results: RoundResult[]): { tally: Tally; badges: Badge[]; records: Set<string> } {
  const tally: Tally = { rounds: 0, visits: 0, items: 0, records: 0 };
  const earned = new Map<BadgeId, string>();
  const records = new Set<string>();
  results.forEach((r, index) => {
    tally.rounds += 1;
    tally.visits += r.visited;
    tally.items += r.items;
    if (setRecord(results, index)) {
      tally.records += 1;
      records.add(r.id);
    }
    for (const badge of BADGES) {
      if (!earned.has(badge.id) && badge.measure(tally) >= badge.target) earned.set(badge.id, r.completedAt);
    }
  });
  return {
    tally,
    records,
    badges: BADGES.map((badge) => ({
      id: badge.id,
      target: badge.target,
      current: Math.min(badge.target, badge.measure(tally)),
      earnedAt: earned.get(badge.id) ?? null,
    })),
  };
}

// ── The page with one's own figures ──────────────────────────────────────────

export type RouteStats = {
  route: string;
  machineIds: string[];
  /** Complete rounds on it with a time. */
  rounds: number;
  best: number | null;
  bestAt: string | null;
  /** The usual time, once there are enough rounds to call anything usual. */
  usual: number | null;
  last: number | null;
  lastAt: string;
};

export type FillerStats = {
  rounds: number;
  visits: number;
  items: number;
  level: Level;
  /** How often a round beat the best time before it on its route. */
  records: number;
  /** The newest of them, if any. */
  lastRecord: { minutes: number; at: string } | null;
  /** This calendar week, Monday to Sunday where the business stands. */
  week: { rounds: number; visits: number; items: number };
  routes: RouteStats[];
  badges: Badge[];
  /** The newest rounds first, each marked when it set a best time. */
  recent: (RoundResult & { record: boolean })[];
};

/** The Monday of the week a moment falls in, as a calendar day where the business stands. */
function mondayOf(now: Date, timeZone: string): string {
  const today = reportDay(now, timeZone);
  const date = new Date(`${today}T12:00:00Z`);
  const back = (date.getUTCDay() + 6) % 7;
  return new Date(date.getTime() - back * 86_400_000).toISOString().slice(0, 10);
}

export function fillerStats(rounds: MyRound[], timeZone: string, now: Date = new Date()): FillerStats {
  const results = rounds.map(roundResult).sort(oldestFirst);
  const { tally, badges, records } = walk(results);

  const monday = mondayOf(now, timeZone);
  const thisWeek = results.filter((r) => reportDay(r.completedAt, timeZone) >= monday);

  const byRoute = new Map<string, RoundResult[]>();
  for (const r of results) byRoute.set(r.route, [...(byRoute.get(r.route) ?? []), r]);
  const routes: RouteStats[] = [...byRoute.values()].map((list) => {
    const timed = list.filter((r) => r.complete && r.minutes !== null);
    const best = timed.reduce<RoundResult | null>((top, r) => (top && top.minutes! <= r.minutes! ? top : r), null);
    const last = list[list.length - 1];
    return {
      route: last.route,
      machineIds: last.machineIds,
      rounds: timed.length,
      best: best?.minutes ?? null,
      bestAt: best?.completedAt ?? null,
      usual: usualTime(timed.map((r) => r.minutes as number)),
      last: last.complete ? last.minutes : null,
      lastAt: last.completedAt,
    };
  });

  return {
    rounds: tally.rounds,
    visits: tally.visits,
    items: tally.items,
    level: levelFor(tally.items),
    records: tally.records,
    lastRecord: (() => {
      const last = results.filter((r) => records.has(r.id)).pop();
      return last && last.minutes !== null ? { minutes: last.minutes, at: last.completedAt } : null;
    })(),
    week: {
      rounds: thisWeek.length,
      visits: thisWeek.reduce((sum, r) => sum + r.visited, 0),
      items: thisWeek.reduce((sum, r) => sum + r.items, 0),
    },
    routes: routes.sort((a, b) => b.rounds - a.rounds || b.lastAt.localeCompare(a.lastAt)),
    badges,
    recent: [...results]
      .reverse()
      .slice(0, 12)
      .map((r) => ({ ...r, record: records.has(r.id) })),
  };
}

// ── The moment a round ends ──────────────────────────────────────────────────

export type RoundReward = {
  result: RoundResult;
  /** Against the same person's earlier complete rounds on this route. */
  verdict: TimeVerdict;
  record: boolean;
  previousBest: number | null;
  usual: number | null;
  /** Earlier complete rounds on this route, so the screen can say how many until times are kept. */
  earlierOnRoute: number;
  before: Level;
  after: Level;
  newBadges: BadgeId[];
};

/**
 * What a round that just ended earned, against the rounds before it. Rounds
 * that ended later (looking back at an old round) do not count against it.
 */
export function roundReward(history: MyRound[], current: MyRound): RoundReward {
  const earlier = history
    .filter((r) => r.id !== current.id && r.completedAt < current.completedAt)
    .map(roundResult)
    .sort(oldestFirst);
  const result = roundResult(current);
  const all = [...earlier, result];
  const before = walk(earlier);
  const after = walk(all);
  const times = timesBefore(all, all.length - 1);
  const timed = result.complete && result.minutes !== null;
  return {
    result,
    verdict: timed ? compareTimes(result.minutes as number, times) : "tooFew",
    record: setRecord(all, all.length - 1),
    previousBest: times.length ? Math.min(...times) : null,
    usual: usualTime(times),
    earlierOnRoute: times.length,
    before: levelFor(before.tally.items),
    after: levelFor(after.tally.items),
    newBadges: after.badges.filter((b) => b.earnedAt && !before.badges.find((x) => x.id === b.id)?.earnedAt).map((b) => b.id),
  };
}

// ── While the round is on ────────────────────────────────────────────────────

/** A drive as earlier rounds measured it; between two machines it counts either way round. */
export function driveMinutes(legs: Record<string, Average>, from: string, to: string): number | null {
  const leg = legs[`${from}→${to}`] ?? (from !== "start" && to !== "end" ? legs[`${to}→${from}`] : undefined);
  return leg && leg.count > 0 ? leg.minutes : null;
}

/**
 * When the round will likely be done, from what earlier rounds measured: the
 * drive to each machine still open, the work there, and the drive back. Never
 * earlier than now. Null as soon as one piece was never measured: an estimate
 * with a hole in it is a guess, and a guess is not shown.
 */
export function roundEta(input: {
  /** Machines still to do, in the order of the round. */
  remaining: string[];
  /** Where the filler was last done: a machine id, or "start". */
  from: string;
  /** When that was (or when the round started). */
  since: string;
  times: { machines: Record<string, Average>; legs: Record<string, Average> };
  now: number;
}): number | null {
  let at = Date.parse(input.since);
  let from = input.from;
  for (const id of input.remaining) {
    const drive = driveMinutes(input.times.legs, from, id);
    const work = input.times.machines[id];
    if (drive === null || !work || work.count === 0) return null;
    at = Math.max(at + drive * 60_000, input.now) + work.minutes * 60_000;
    from = id;
  }
  const back = driveMinutes(input.times.legs, from, "end");
  if (back === null) return null;
  return Math.max(at + back * 60_000, input.now);
}

/**
 * Which way to say how far along the round is. Before halfway what is done
 * spurs people on, after it what is left does: the smaller of the two is the
 * one that motivates (Koo & Fishbach's "small-area" effect).
 */
export const progressFrame = (done: number, total: number): "done" | "left" => (done * 2 < total ? "done" : "left");
