// Checks the refill round logic (src/lib/refill-flow.ts). Run: npm run test:flow
import { uncovered } from "../src/lib/assignments.ts";
import { cleanRoundSettings, DEFAULT_ROUND_SETTINGS } from "../src/lib/round-settings.ts";
import { allocate, itemReport, roundActual, roundCost, levelAfter, onlyMine, pickList, returnsFor, roundTimings, slotKey, pickKey, type FlowLine, type StopRecord } from "../src/lib/refill-flow.ts";
import type { RefillLine, RefillSheet } from "../src/lib/types.ts";
import { compareMoneySince } from "../src/lib/stats.ts";
const L = (sel: string, product: string, cap: number, stock: number | null, take: number, row = 1): FlowLine =>
  ({ machineId: "m1", selection: sel, row, slot: Number(sel), productId: product, productName: product.toUpperCase(), photoPath: null, capacity: cap, stock, take, expired: 0 });
const lines = [L("1", "bami", 2, 0, 2), L("63", "bami", 2, 1, 1, 6), L("3", "nasi", 2, null, 2), L("5", "mihoen", 2, 2, 0)];
const ok = (name: string, cond: boolean) => { console.log(cond ? "ok  " : "FAIL", name); if (!cond) process.exitCode = 1; };
const pl = pickList(lines);
ok("pick list sums per product, drops zero", pl.length === 2 && pl.find(r => r.productId === "bami")!.take === 3);
const prep = allocate(lines, { [pickKey("m1","bami")]: 2, [pickKey("m1","nasi")]: 2 });
ok("shortage leaves the fuller slot short (empty slot 1 gets 2, slot 63 gets 0)", prep[slotKey("m1","1")] === 2 && prep[slotKey("m1","63")] === 0);
ok("unknown slot gets its share", prep[slotKey("m1","3")] === 2);
const base = { selection: "1", prepared: 2, filled: 2, removed: [], countAfter: null, full: false };
ok("known: stock + filled, capped", levelAfter({ capacity: 2 }, 1, { ...base, filled: 2 }) === 2);
ok("known: removal subtracts first", levelAfter({ capacity: 2 }, 2, { ...base, filled: 1, removed: [{ reason: "expired", qty: 1 }] }) === 2);
ok("unknown, nothing filled, nobody looked: stays unknown", levelAfter({ capacity: 2 }, null, { ...base, filled: 0 }) === null);
ok("unknown + a whole slot's worth filled = full", levelAfter({ capacity: 2 }, null, { ...base, filled: 2 }) === 2);
ok("unknown + less than a slot's worth stays unknown", levelAfter({ capacity: 2 }, null, { ...base, filled: 1 }) === null);
ok("seen full writes capacity", levelAfter({ capacity: 2 }, null, { ...base, full: true }) === 2);
ok("count wins and is clamped", levelAfter({ capacity: 2 }, 0, { ...base, countAfter: 5 }) === 2);
const rets = returnsFor(lines, [], { [pickKey("m1","bami")]: 3, [pickKey("m1","nasi")]: 2 },
  { m1: { checkedAt: null, completedAt: "x", skipped: false, technical: false, note: null, lines: [
    { ...base, selection: "1", filled: 2 }, { ...base, selection: "63", filled: 0 }, { ...base, selection: "3", filled: 1, removed: [{ reason: "expired", qty: 1 }] } ] } });
const bamiBack = rets.find(r => r.productId === "bami" && r.source === "leftover");
const nasiBack = rets.find(r => r.productId === "nasi" && r.source === "leftover");
const nasiOut = rets.find(r => r.productId === "nasi" && r.source === "removed");
ok("leftover = picked − filled (bami 1, nasi 1)", bamiBack?.qty === 1 && nasiBack?.qty === 1);
ok("removed expired defaults to waste", nasiOut?.qty === 1 && nasiOut.disposition === "waste");
// Taken out of a slot the round did not plan to fill: the slot's own product, not dropped.
const unplanned = returnsFor(lines, [{ machineId: "m1", selection: "11", productId: "kip", productName: "Kip zoetzuur" }], {},
  { m1: { checkedAt: null, completedAt: "x", skipped: false, technical: false, note: null, lines: [
    { ...base, selection: "11", prepared: 0, filled: 0, removed: [{ reason: "expired", qty: 1 }] } ] } });
ok("removed from an unplanned slot comes back", unplanned.length === 1 && unplanned[0].productId === "kip" && unplanned[0].productName === "Kip zoetzuur" && unplanned[0].qty === 1);

// A shop on a shared fridge: its own machine, product and slots, nothing of the co-tenant's.
const RL = (machine: string, sel: string, product: string): RefillLine => ({ machine_id: machine, machine_name: machine, row_position: 1, slot_position: 1,
  selection_number: sel, product_id: product, product_name: product, photo_path: null, stock: 0, capacity: 4, to_add: 2, shelf_life_days: null, next_expires_at: null, qty_expired: 0 });
const stop = (sels: string[]) => ({ checkedAt: null, completedAt: "x", skipped: false, technical: false, note: null,
  lines: sels.map((sel) => ({ ...base, selection: sel, removed: [{ reason: "expired" as const, qty: 1 }] })) });
const shared = { id: "s", share_token: "secret", machine_ids: ["fridge", "other"], notes: null, created_at: "", started_at: null, completed_at: null,
  filled_by: null, km: null, flow_version: 2,
  lines: [RL("fridge", "11", "mine-a"), RL("fridge", "12", "theirs-b"), RL("other", "11", "mine-a")],
  box: { "fridge:mine-a": 2, "fridge:theirs-b": 2, "other:mine-a": 2 },
  stops: { fridge: stop(["11", "12", "13", "14"]), other: stop(["11"]) },
  returns: [
    { productId: "mine-a", productName: "A", source: "leftover", reason: null, disposition: "stock", qty: 1 },
    { productId: "theirs-b", productName: "B", source: "removed", reason: "expired", disposition: "waste", qty: 2 },
  ] } as unknown as RefillSheet;
const view = { machines: ["fridge"], products: new Set(["mine-a"]), slots: new Set([slotKey("fridge", "13")]) };
const seenByShop = onlyMine(shared, view);
ok("shop: only its own machine", seenByShop.machine_ids.join() === "fridge" && !("other" in seenByShop.stops));
ok("shop: only its own product's lines", seenByShop.lines.length === 1 && seenByShop.lines[0].product_id === "mine-a");
ok("shop: stop lines only for its slots (planned 11, own unplanned 13)", seenByShop.stops.fridge.lines.map((l) => l.selection).join() === "11,13");
ok("shop: box only its own product on its machine", Object.keys(seenByShop.box).join() === "fridge:mine-a");
ok("shop: no share link", seenByShop.share_token === "");
const nothing = onlyMine(shared, { machines: [], products: new Set(), slots: new Set() });
ok("shop with nothing sees nothing", !nothing.machine_ids.length && !nothing.lines.length && !Object.keys(nothing.stops).length && !Object.keys(nothing.box).length);
ok("shop: only its own products come back", seenByShop.returns?.map((r) => r.productId).join() === "mine-a");
ok("shop: not the operator's note for the filler", onlyMine({ ...shared, notes: "about the neighbour" } as RefillSheet, view).notes === null);
// What really went in, for the list, the paper and the spreadsheet of a finished round.
ok("actual: an open round has none", roundActual(shared, []) === null);
const closed = roundActual({ ...shared, completed_at: "2026-10-14T12:00:00Z", stops: { ...shared.stops, other: { ...stop([]), skipped: true } } } as RefillSheet, []);
ok("actual: per slot what went in", closed !== null && closed.actual.filled[slotKey("fridge", "12")] === shared.stops.fridge.lines[1].filled);
ok("actual: the skipped machine is named", closed?.actual.skipped.join() === "other");
ok("actual: an old round has none", roundActual({ ...shared, flow_version: 1, completed_at: "x" } as unknown as RefillSheet, []) === null);
const oldRun = onlyMine({ ...shared, flow_version: 1, box: { "mine-a": 3, "theirs-b": 5 } } as unknown as RefillSheet, view);
ok("shop: an old run's box only its own product", Object.keys(oldRun.box ?? {}).join() === "mine-a");

// The report of a finished round, per product.
const report = itemReport(
  [RL("fridge", "11", "mine-a"), RL("fridge", "12", "theirs-b")],
  { "fridge:mine-a": 3, "fridge:theirs-b": 2 },
  { fridge: { checkedAt: null, completedAt: "x", skipped: false, technical: false, note: null, lines: [
    { ...base, selection: "11", filled: 2, removed: [] }, { ...base, selection: "12", filled: 0, removed: [] } ] } },
  [
    { productId: "mine-a", productName: "mine-a", source: "leftover", reason: null, disposition: "stock", qty: 1 },
    { productId: "theirs-b", productName: "theirs-b", source: "removed", reason: "expired", disposition: "waste", qty: 1 },
    { productId: "theirs-b", productName: "theirs-b", source: "leftover", reason: null, disposition: "stock", qty: 2 },
  ],
  [{ productId: "mine-a", qty: 1 }],
);
const a = report.find((r) => r.productId === "mine-a")!;
const bb = report.find((r) => r.productId === "theirs-b")!;
ok("report: taken, filled, back and short per product", a.taken === 3 && a.filled === 2 && a.back === 1 && a.short === 1);
ok("report: taken out by reason, and where it went", bb.out.expired === 1 && bb.back === 2 && bb.went.waste === 1 && bb.went.stock === 2);
ok("report: most filled first", report[0].productId === "mine-a");

// Time: whole rounds, the work at each machine, and the drives between them.
const at = (hhmm: string) => `2026-10-13T${hhmm}:00.000Z`;
const visit = (arrived: string | null, done: string, skipped = false) => ({
  checkedAt: arrived ? at(arrived) : null, completedAt: at(done), skipped, technical: false, note: null, lines: [] });
const timings = roundTimings([
  { filledBy: "Jonas", readyAt: at("08:00"), completedAt: at("09:00"),
    stops: { kortemark: visit("08:10", "08:20"), diksmuide: visit("08:40", "08:50"), gits: visit(null, "08:55", true) } },
  { filledBy: "jonas ", readyAt: at("10:00"), completedAt: at("11:30"),
    stops: { diksmuide: visit("10:20", "10:40"), kortemark: visit("11:00", "11:10") } },
  { filledBy: null, readyAt: at("12:00"), completedAt: at("13:00"),
    stops: { kortemark: visit("12:10", "12:20"), gits: visit(null, "12:25", true), diksmuide: visit("12:40", "12:50") } },
]);
const jonas = timings.fillers.find((p) => p.name?.toLowerCase() === "jonas");
ok("timings: a whole round, per filler, whatever the case of the name", jonas?.rounds === 2 && jonas.round.minutes === 75 && jonas.round.count === 2);
ok("timings: machines per round, so a long round is not a slow filler", jonas?.machinesPerRound === 2);
ok("timings: a round without a name is still counted, as nobody's", timings.fillers.some((p) => p.name === null && p.rounds === 1));
ok("timings: work at a machine, averaged with its count", timings.machines.kortemark.minutes === 10 && timings.machines.kortemark.count === 3 && timings.machines.diksmuide.minutes === 40 / 3);
ok("timings: drives in the order really driven", timings.legs["start→kortemark"].minutes === 10 && timings.legs["diksmuide→kortemark"].minutes === 20);
ok("timings: a drive with a skip in it is not measured", timings.legs["kortemark→diksmuide"].count === 1 && timings.legs["kortemark→diksmuide"].minutes === 20);
ok("timings: the way back is its own leg", timings.legs["diksmuide→end"].minutes === 10 && timings.legs["kortemark→end"].minutes === 20);
ok("timings: a skipped machine is no visit", !("gits" in timings.machines));

// Linking unlinked sales fills only the time no product covers.
const T1 = "2026-10-06T09:30:00+00:00";
const T2 = "2026-10-09T12:00:00+00:00";
ok("gaps: a product since a rearrangement leaves the time before it", JSON.stringify(uncovered([{ valid_from: T1, valid_to: null }])) === JSON.stringify([{ from: "-infinity", to: T1 }]));
ok("gaps: a slot with a product all along has none", uncovered([{ valid_from: "-infinity", valid_to: null }]).length === 0);
ok("gaps: between two products, the stretch with neither", JSON.stringify(uncovered([{ valid_from: T2, valid_to: null }, { valid_from: "-infinity", valid_to: T1 }])) === JSON.stringify([{ from: T1, to: T2 }]));
ok("gaps: a cleared slot is open from the moment it was cleared", JSON.stringify(uncovered([{ valid_from: "-infinity", valid_to: T1 }])) === JSON.stringify([{ from: T1, to: null }]));
ok("gaps: a product swapped at one moment leaves nothing between", uncovered([{ valid_from: "-infinity", valid_to: T1 }, { valid_from: T1, valid_to: null }]).length === 0);

// What a round cost: time at the hourly rate, kilometres at the kilometre rate.
const cost = roundCost({ minutes: 72, km: 38, machineKm: [12, 20], perHour: 25, perKm: 0.42 });
ok("cost: time plus kilometres", cost.time === 30 && Math.abs(cost.drive! - 15.96) < 1e-9 && Math.abs(cost.total - 45.96) < 1e-9 && cost.kmFrom === "round");
const oneMachine = roundCost({ minutes: 30, km: null, machineKm: [24], perHour: 25, perKm: 0.5 });
ok("cost: one machine falls back to its distance there and back", oneMachine.km === 24 && oneMachine.kmFrom === "machine" && oneMachine.total === 24.5);
const unknown = roundCost({ minutes: 60, km: null, machineKm: [12, 20], perHour: 25, perKm: 0.42 });
ok("cost: without kilometres the drive is unknown, not zero", unknown.drive === null && unknown.kmFrom === null && unknown.total === 25);

// How the operator wants rounds to go: whatever is stored, made safe.
ok("settings: nothing stored is the defaults", JSON.stringify(cleanRoundSettings(null)) === JSON.stringify(DEFAULT_ROUND_SETTINGS));
const custom = cleanRoundSettings({ checks: ["  Ruit  gepoetst ", "ruit gepoetst", "", 3, "x".repeat(90)], message: "  Koelbox terug  ", allowSkip: false, notify: { eachMachine: true }, extra: 1 });
ok("settings: checks trimmed, kept once, capped", custom.checks.length === 2 && custom.checks[0] === "Ruit gepoetst" && custom.checks[1].length === 60);
ok("settings: message trimmed, flags kept, the rest default", custom.message === "Koelbox terug" && custom.allowSkip === false && !("askKm" in custom) && custom.notify.eachMachine && custom.notify.start && custom.notify.finish);
ok("settings: at most eight checks", cleanRoundSettings({ checks: Array.from({ length: 12 }, (_, i) => `check ${i}`) }).checks.length === 8);

// Money shown, pieces tested: only a change both agree on is real.
ok("money: pieces and money up is up", compareMoneySince(200, 100, 800, 500, null, "2026-09-01") === "up");
ok("money: more pieces for less money is noise, not up", compareMoneySince(200, 100, 450, 500, null, "2026-09-01") === "noise");
ok("money: fewer pieces for more money is noise, not down", compareMoneySince(50, 100, 520, 500, null, "2026-09-01") === "noise");
ok("money: too few stays too few", compareMoneySince(10, 8, 50, 20, null, "2026-09-01") === "tooFew");

// ── A filler's own figures (src/lib/filler-stats.ts) and the time rules in stats.ts ──
import { compareTimes, isRecord, MIN_ROUNDS } from "../src/lib/stats.ts";
import { fillerStats, lastMonths, levelFor, monthDays, progressFrame, roundEta, roundResult, roundReward, roundsByMonth, summarizeRound, type MyRound } from "../src/lib/filler-stats.ts";
import { isDeepStrictEqual } from "node:util";

ok("times: fewer than MIN_ROUNDS earlier rounds is no comparison", MIN_ROUNDS === 3 && compareTimes(30, [60, 62]) === "tooFew");
ok("times: inside the usual spread is usual", compareTimes(57, [60, 62, 58]) === "usual");
ok("times: well under the usual time is faster", compareTimes(50, [60, 62, 58]) === "faster");
ok("times: well over is slower", compareTimes(75, [60, 62, 58]) === "slower");
ok("times: rounds that happen to agree do not make a second a trend", compareTimes(59, [60, 60, 60, 60]) === "usual" && compareTimes(57, [60, 60, 60, 60]) === "usual");
ok("times: one flat tyre does not widen the spread", compareTimes(50, [60, 61, 59, 60, 140]) === "faster");
ok("record: needs MIN_ROUNDS earlier rounds to beat", !isRecord(10, [60, 62]) && isRecord(57, [60, 62, 58]));
ok("record: a tie is no record", !isRecord(58, [60, 62, 58]));

ok("level: a new filler is on level 1", levelFor(0).level === 1 && levelFor(0).progress === 0 && levelFor(99).level === 1);
ok("level: 100 pieces is level 2, 300 is 3, 600 is 4", levelFor(100).level === 2 && levelFor(299).level === 2 && levelFor(300).level === 3 && levelFor(600).level === 4);
ok("level: progress runs from where the level began", levelFor(200).from === 100 && levelFor(200).to === 300 && levelFor(200).progress === 0.5);

const on = (day: number, hour: number, minute = 0) => new Date(Date.UTC(2026, 9, day, hour, minute)).toISOString();
const done = (filled: number[], from: string, to: string, skipped = false): StopRecord => ({
  checkedAt: skipped ? null : from, completedAt: to, skipped, technical: false, note: null,
  lines: skipped ? [] : filled.map((n, i) => ({ selection: String(i + 1), prepared: n, filled: n, removed: [], countAfter: null, full: false })),
});
// One route (a, b), every week; minutes 60, 62, 58, then the round under test.
// Summed up on the phone, the way the round that just ended is.
const R = (id: string, day: number, minutes: number, opts: { skip?: boolean; machines?: string[]; filled?: number } = {}): MyRound => {
  const machineIds = opts.machines ?? ["a", "b"];
  const start = on(day, 8);
  const end = new Date(Date.parse(start) + minutes * 60_000).toISOString();
  return summarizeRound({ id, readyAt: start, completedAt: end, machineIds, stops: Object.fromEntries(machineIds.map((m, i) =>
    [m, done([opts.filled ?? 10, opts.filled ?? 10], on(day, 8, 10 + i * 20), on(day, 8, 20 + i * 20), opts.skip === true && i === 1)])) });
};
const history = [R("r1", 1, 60), R("r2", 2, 62), R("r3", 3, 58)];

// Earlier rounds come summed up by the database (filler_rounds), the round that
// just ended by summarizeRound on the phone: the two have to agree.
const D = (id: string, day: number, minutes: number, sums: { visited: number; skipped: number; items: number }, machineIds = ["a", "b"]): MyRound =>
  ({ id, readyAt: on(day, 8), completedAt: new Date(Date.parse(on(day, 8)) + minutes * 60_000).toISOString(), machineIds, ...sums });
const sum = (stops: Record<string, StopRecord>) => summarizeRound({ id: "s", readyAt: on(5, 8), completedAt: on(5, 9), machineIds: ["a", "b"], stops });
ok("summary: the phone sums a round up the way the database sends it", isDeepStrictEqual(R("r1", 1, 60), D("r1", 1, 60, { visited: 2, skipped: 0, items: 40 })));
ok("summary: a skipped machine's pieces do not count, even when it has lines",
  isDeepStrictEqual(sum({ a: done([3, 4], on(5, 8, 10), on(5, 8, 20)), b: { ...done([5], on(5, 8, 30), on(5, 8, 40)), skipped: true } }), D("s", 5, 60, { visited: 1, skipped: 1, items: 7 })));
ok("summary: a line below nothing counts as nothing", sum({ a: done([-3, 6], on(5, 8, 10), on(5, 8, 20)) }).items === 6);
const open = sum({ a: { ...done([4], on(5, 8, 10), on(5, 8, 20)), completedAt: null } });
ok("summary: a machine neither done nor skipped is no visit, but its pieces count", open.visited === 0 && open.skipped === 0 && open.items === 4);
ok("summary: a round without stops is all zeros", isDeepStrictEqual(sum({}), D("s", 5, 60, { visited: 0, skipped: 0, items: 0 })));
const full = { visited: 2, skipped: 0, items: 40 };
const fromDb = [D("r1", 1, 60, full), D("r2", 2, 62, full), D("r3", 3, 58, full), D("q", 8, 50, full),
  D("w", 13, 70, { visited: 1, skipped: 0, items: 20 }, ["c"]), D("w2", 14, 66, { visited: 1, skipped: 1, items: 20 })];
const onPhone = [...history, R("q", 8, 50), R("w", 13, 70, { machines: ["c"] }), R("w2", 14, 66, { skip: true })];
ok("summary: the database's rows give the same figures as rounds summed on the phone",
  isDeepStrictEqual(fillerStats(fromDb, "Europe/Brussels", new Date(on(15, 12))), fillerStats(onPhone, "Europe/Brussels", new Date(on(15, 12)))));
ok("summary: what a round earned is the same against the database's history",
  isDeepStrictEqual(roundReward(fromDb.slice(0, 3), R("q", 8, 50)), roundReward(history, R("q", 8, 50))));

const one = roundResult(R("x", 5, 45, { skip: true }));
ok("result: a skipped machine is not visited, and its pieces do not count", one.visited === 1 && one.skipped === 1 && one.items === 20 && !one.complete);
ok("result: the route is the machines in any order", roundResult(R("y", 5, 45, { machines: ["b", "a"] })).route === roundResult(R("z", 5, 45)).route);
ok("result: a round left open overnight has no time", roundResult({ ...R("o", 5, 60), completedAt: on(6, 9) }).minutes === null);

const first = roundReward([], R("f", 1, 60));
ok("reward: a first round compares with nothing", first.verdict === "tooFew" && !first.record && first.earlierOnRoute === 0);
const quick = roundReward(history, R("q", 8, 50));
ok("reward: clearly under the usual time on this route is faster and a record", quick.verdict === "faster" && quick.record && quick.previousBest === 58 && quick.usual === 60);
const close = roundReward(history, R("c", 8, 57));
ok("reward: a minute under the best is a record, but no trend", close.record && close.verdict === "usual");
const skipped = roundReward(history, R("s", 8, 30, { skip: true }));
ok("reward: a round with a skip sets no time", !skipped.record && skipped.verdict === "tooFew");
const elsewhere = roundReward(history, R("e", 8, 20, { machines: ["c"] }));
ok("reward: another route has no earlier times", elsewhere.verdict === "tooFew" && !elsewhere.record && elsewhere.earlierOnRoute === 0);
const later = roundReward([...history, R("later", 20, 40)], R("q", 8, 50));
ok("reward: looking back, rounds that ended later do not count against it", later.record && later.earlierOnRoute === 3);
// Two lines on each of two machines: a round of `filled` puts in four times that.
const big = roundReward([R("b1", 1, 60, { filled: 120 }), R("b2", 2, 60, { filled: 120 })], R("b3", 3, 60, { filled: 15 }));
ok("reward: the level before and after the round", big.before.items === 960 && big.before.level === 4 && big.after.items === 1020 && big.after.level === 5);

const stats = fillerStats([...history, R("q", 8, 50), R("w", 13, 70, { machines: ["c"] }), R("w2", 14, 66, { skip: true })], "Europe/Brussels", new Date(on(15, 12)));
ok("stats: totals over every round", stats.rounds === 6 && stats.items === 4 * 40 + 20 + 20 && stats.visits === 10);
ok("stats: this week is Monday 12 October on", stats.week.rounds === 2 && stats.week.items === 40);
ok("stats: records counted, the newest one remembered", stats.records === 1 && stats.lastRecord?.minutes === 50 && stats.lastRecord.at === R("q", 8, 50).completedAt);
const route = stats.routes[0];
ok("stats: per route the best, the usual and the last complete time", route.rounds === 4 && route.best === 50 && route.usual === 59 && route.last === null);
ok("stats: a record is marked on its round, newest first", stats.recent[0].id === "w2" && stats.recent.find((r) => r.id === "q")?.record === true);
ok("stats: no badges, only a level and records", !("badges" in stats) && stats.records === 1);

const legs = { "start→a": { minutes: 10, count: 2 }, "b→a": { minutes: 15, count: 1 }, "b→end": { minutes: 12, count: 2 } };
const machinesAt = { a: { minutes: 8, count: 2 }, b: { minutes: 6, count: 2 } };
const t0 = Date.parse(on(16, 8));
ok("eta: the drives and the work still ahead, then back", roundEta({ remaining: ["a", "b"], from: "start", since: on(16, 8), times: { machines: machinesAt, legs }, now: t0 }) === t0 + (10 + 8 + 15 + 6 + 12) * 60_000);
ok("eta: never before now", roundEta({ remaining: ["b"], from: "a", since: on(16, 8), times: { machines: machinesAt, legs }, now: t0 + 60 * 60_000 }) === t0 + (60 + 6 + 12) * 60_000);
ok("eta: one drive never measured is no estimate", roundEta({ remaining: ["a", "c"], from: "start", since: on(16, 8), times: { machines: machinesAt, legs }, now: t0 }) === null);
ok("eta: only the way back is left", roundEta({ remaining: [], from: "b", since: on(16, 8), times: { machines: machinesAt, legs }, now: t0 }) === t0 + 12 * 60_000);
ok("frame: what is done before halfway, what is left from halfway", progressFrame(1, 4) === "done" && progressFrame(2, 4) === "left" && progressFrame(0, 1) === "done");
const threeRecords = fillerStats([R("t1", 1, 60), R("t2", 2, 62), R("t3", 3, 58), R("t4", 4, 57), R("t5", 5, 56), R("t6", 6, 59), R("t7", 7, 55)], "Europe/Brussels", new Date(on(15, 12)));
ok("records: three times the best was beaten, the newest one remembered", threeRecords.records === 3 && threeRecords.lastRecord?.at === R("t7", 7, 55).completedAt);

// ── The route the owner sets (src/lib/round-settings.ts) ──
import { mergeRoute, orderByRoute } from "../src/lib/round-settings.ts";
const [mA, mB, mC, mD, mE, mF] = ["a", "b", "c", "d", "e", "f"].map((x) => `${x.repeat(8)}-${x.repeat(4)}-${x.repeat(4)}-${x.repeat(4)}-${x.repeat(12)}`);
ok("route: kept clean, once each, only machine ids", cleanRoundSettings({ route: [mA, mA, "x", 3, mB.toUpperCase(), mC] }).route.join() === [mA, mB.toUpperCase(), mC].join());
ok("route: nothing stored is no route", cleanRoundSettings(null).route.length === 0 && cleanRoundSettings({ route: "x" }).route.length === 0);
ok("route: machines follow it, the ones not on it after, in their own order", orderByRoute([mF, mC, mA, mE], [mE, mA, mB, mC]).join() === [mE, mA, mC, mF].join());
ok("route: a round put in order takes its machines' places", mergeRoute([mA, mB, mC, mD, mE], [mE, mB, mD]).join() === [mA, mE, mC, mB, mD].join());
ok("route: a machine new to the route takes a place in the round's order", mergeRoute([mA, mB, mC], [mF, mA]).join() === [mF, mB, mC, mA].join());
ok("route: an empty route becomes the round's order", mergeRoute([], [mC, mA]).join() === [mC, mA].join());
import { legKey, routeKm } from "../src/lib/round-settings.ts";
ok("legs: one key for a pair, whichever way round; start and end are the depot", legKey(mA, mB) === legKey(mB, mA) && legKey("start", mA) === legKey(mA, "end") && legKey("start", mA).split("|").sort().join() === [mA, "depot"].sort().join());
const cleanLegs = cleanRoundSettings({ legs: { [legKey("start", mA)]: 12.44, [legKey(mA, mB)]: 8, [legKey(mB, "end")]: 15, bad: 3, [`${mA}|${mA}`]: 2, [legKey(mA, mC)]: -1, [legKey(mB, mC)]: 2000 } }).legs;
ok("legs: kept clean, to one decimal, nonsense dropped", Object.keys(cleanLegs).length === 3 && cleanLegs[legKey("start", mA)] === 12.4);
ok("legs: a round from the depot, past each machine, and back", routeKm([mA, mB], cleanLegs) === 35.4);
ok("legs: one leg without a distance is no distance", routeKm([mB, mA, mC], cleanLegs) === null && routeKm([], cleanLegs) === null);
const viaRoute = roundCost({ minutes: 60, km: null, routeKm: 35.4, machineKm: [12, 20], perHour: 25, perKm: 0.5 });
ok("cost: without kilometres on the round, the route's distances count", viaRoute.km === 35.4 && viaRoute.kmFrom === "route" && viaRoute.total === 25 + 17.7);
ok("cost: kilometres written on the round still come first", roundCost({ minutes: 60, km: 40, routeKm: 35.4, machineKm: [], perHour: 25, perKm: 0.5 }).kmFrom === "round");

// ── Packing short, and tapping pieces in at a machine (src/lib/refill-flow.ts) ──
import { shortages, slotTally, tapOnce, type PickRow } from "../src/lib/refill-flow.ts";
const P = (machine: string, product: string, take: number): PickRow => ({ key: pickKey(machine, product), machineId: machine, productId: product, productName: product.toUpperCase(), photoPath: null, take });
const packed = shortages([P("m1", "bami", 3), P("m2", "bami", 2), P("m1", "curry", 2), P("m1", "nasi", 4)], { [pickKey("m1", "bami")]: 1, [pickKey("m2", "bami")]: 2, [pickKey("m1", "nasi")]: 9 });
ok("short: per product over the machines, most first", isDeepStrictEqual(packed.map((item) => [item.productId, item.n]), [["bami", 2], ["curry", 2]]));
ok("short: more in the box than needed is nothing short, never less than nothing", !packed.some((item) => item.productId === "nasi"));
ok("short: nothing short is an empty list", shortages([P("m1", "bami", 2)], { [pickKey("m1", "bami")]: 2 }).length === 0);
ok("tap: one piece a tap, up to what was set aside", tapOnce(2, undefined) === 1 && tapOnce(2, 1) === 2 && tapOnce(2, 2) === null && tapOnce(0, undefined) === null);
ok("slot: not touched is not done; half is not done; all is done", !slotTally(2, undefined).done && !slotTally(2, 1).done && slotTally(2, 2).done);
ok("slot: a typed number is final, also below the plan", isDeepStrictEqual(slotTally(2, 1, true), { n: 1, aim: 1, done: true }) && slotTally(2, 3, true).done);
ok("slot: nothing set aside is done before it starts", slotTally(0, undefined).done && slotTally(0, undefined).aim === 0);
ok("slot: typed without a number is not typed", !slotTally(2, undefined, true).done);

// ── A machine that stood full: on the route, not among the ones to visit ──
import { roundOrder } from "../src/lib/refill-flow.ts";
ok("order: the chosen order, the full one in its place", roundOrder([mA, mB, mC], [mA, mC]).join() === [mA, mB, mC].join());
ok("order: a round from before keeps its own machines", roundOrder([], [mC, mA]).join() === [mC, mA].join());
ok("order: a machine on the round but not chosen comes after, once", roundOrder([mA, mB], [mB, mD]).join() === [mA, mB, mD].join());
const fullAtShop = onlyMine({ ...shared, chosen_machine_ids: ["fridge", "full-theirs", "other"] } as RefillSheet, view);
ok("shop: a full machine of another business stays out of its run", fullAtShop.chosen_machine_ids?.join() === "fridge");
ok("shop: a run read without the chosen list gets none", !("chosen_machine_ids" in onlyMine(shared, view)));

// ── Renting to businesses is Automatenshop's (src/lib/plans.ts) ──
import { cheapestWith, planAllows, planById } from "../src/lib/plans.ts";
ok("plans: a zaak rents nothing to businesses, an automatenshop does", !planAllows(planById("zaak"), "shareWithShops") && planAllows(planById("automatenshop"), "shareWithShops"));
ok("plans: the lock note points at Automatenshop", cheapestWith("shareWithShops").id === "automatenshop");
ok("plans: an account from before packages keeps everything", planAllows(null, "shareWithShops"));

// ── Splitting what came back, and a round in figures (src/lib/refill-flow.ts) ──
import { roundFigures, splitReturn, type ReturnRow } from "../src/lib/refill-flow.ts";
const eend: ReturnRow = { productId: "eend", productName: "Eend zoetzuur", source: "leftover", reason: null, disposition: "stock", qty: 2 };
const parts = (rows: ReturnRow[]) => rows.map((r) => `${r.disposition}:${r.qty}`).join(",");
ok("split: 1 Too Good To Go, the rest thrown away", parts(splitReturn(eend, [{ disposition: "promo", qty: 1 }, { disposition: "waste", qty: 1 }])) === "promo:1,waste:1");
ok("split: a phone from before splitting sends all of it to one place", parts(splitReturn(eend, [{ disposition: "waste" }])) === "waste:2");
ok("split: nothing chosen keeps Vendly's choice", parts(splitReturn(eend, [])) === "stock:2" && parts(splitReturn(eend, [{ disposition: "nonsense", qty: 2 }])) === "stock:2");
ok("split: more than came back is cut to what came back", parts(splitReturn(eend, [{ disposition: "promo", qty: 5 }])) === "promo:2");
ok("split: less than came back, the rest goes where Vendly would send it", parts(splitReturn({ ...eend, qty: 3 }, [{ disposition: "promo", qty: 1 }])) === "promo:1,stock:2");
ok("split: odd numbers count as nothing", parts(splitReturn(eend, [{ disposition: "promo", qty: -1 }, { disposition: "waste", qty: 1.5 }])) === "stock:2");
ok("split: the same place twice adds up", parts(splitReturn(eend, [{ disposition: "waste", qty: 1 }, { disposition: "waste", qty: 1 }])) === "waste:2");
const figures = roundFigures(itemReport(
  [{ machine_id: "m1", selection_number: "11", product_id: "eend", product_name: "Eend zoetzuur" }],
  { "m1:eend": 5 },
  { m1: { checkedAt: null, completedAt: "x", skipped: false, technical: false, note: null, lines: [{ selection: "11", prepared: 3, filled: 3, removed: [], countAfter: null, full: false }] } },
  splitReturn(eend, [{ disposition: "promo", qty: 1 }, { disposition: "waste", qty: 1 }]),
  [{ productId: "eend", qty: 1 }],
));
ok("figures: taken, filled, Too Good To Go, thrown away and short", figures.taken === 5 && figures.filled === 3 && figures.went.promo === 1 && figures.went.waste === 1 && figures.went.stock === 0 && figures.short === 1);

// ── What to bring tomorrow (src/lib/refill-flow.ts, 18-10-2026) ──
import { stillMissing } from "../src/lib/refill-flow.ts";
const stopAt = (filled: Record<string, number>, skipped = false): StopRecord => ({ checkedAt: null, completedAt: "x", skipped, technical: false, note: null,
  lines: Object.entries(filled).map(([selection, n]) => ({ selection, prepared: n, filled: n, removed: [], countAfter: null, full: false })) });
// bami: 3 to take, 2 in the box, slot 63 stayed empty → 1 tomorrow. nasi: all in the box, slot 3 got 1 (fuller than thought) → the other came back, nothing tomorrow.
const missing = stillMissing(lines, { [pickKey("m1", "bami")]: 2, [pickKey("m1", "nasi")]: 2 }, { m1: stopAt({ "1": 2, "63": 0, "3": 1 }) });
ok("tomorrow: what the box lacked and the slot missed", missing.length === 1 && missing[0].productId === "bami" && missing[0].n === 1);
ok("tomorrow: a machine passed by brings its pieces back, nothing to make", stillMissing(lines, { [pickKey("m1", "bami")]: 3, [pickKey("m1", "nasi")]: 2 }, { m1: stopAt({}, true) }).length === 0);
ok("tomorrow: never more than the box was short", stillMissing(lines, { [pickKey("m1", "bami")]: 2, [pickKey("m1", "nasi")]: 2 }, { m1: stopAt({ "1": 0, "63": 0, "3": 2 }) })[0]?.n === 1);

// ── What a slot takes on a round (src/lib/refill-flow.ts) ──
import { lineTake } from "../src/lib/refill-flow.ts";
ok("take: what the slot lacks", lineTake({ capacity: 6, to_add: 2 }) === 2);
ok("take: never more than fits, never below none", lineTake({ capacity: 4, to_add: 7 }) === 4 && lineTake({ capacity: 4, to_add: -1 }) === 0);


// ── Month by month on the filler's Verkoop page ──
const BXL = "Europe/Brussels";
ok("months: the last three, newest first", isDeepStrictEqual(lastMonths(3, BXL, new Date("2026-10-19T10:00:00Z")), ["2026-10", "2026-09", "2026-08"]));
ok("months: across the new year", isDeepStrictEqual(lastMonths(3, BXL, new Date("2026-01-05T10:00:00Z")), ["2026-01", "2025-12", "2025-11"]));
ok("months: the month where the business stands, not in UTC", lastMonths(1, BXL, new Date("2026-10-31T23:30:00Z"))[0] === "2026-11");
ok("months: first and last day", isDeepStrictEqual(monthDays("2026-02"), { from: "2026-02-01", to: "2026-02-28" }) && monthDays("2028-02").to === "2028-02-29" && monthDays("2026-10").to === "2026-10-31");
{
  const september = { ...R("old", 1, 60), readyAt: "2026-09-30T08:00:00Z", completedAt: "2026-09-30T09:00:00Z" };
  const rounds = [R("m1", 5, 60), R("m2", 7, 50, { filled: 5 }), R("m3", 7, 40), R("m4", 9, 13 * 60), september];
  const [oct, sep] = roundsByMonth(rounds, ["2026-10", "2026-09"], BXL);
  ok("by month: each round in the month it ended", oct.rounds.length === 4 && sep.rounds.length === 1);
  ok("by month: newest first", oct.rounds[0].id === "m4" && oct.rounds[3].id === "m1");
  ok("by month: machines and pieces add up", oct.visits === 8 && oct.items === 40 + 20 + 40 + 40);
  ok("by month: a clock left running adds no time", oct.minutes === 60 + 50 + 40);
  ok("by month: the busiest day sums its rounds", oct.busiest?.day === "2026-10-07" && oct.busiest.items === 60);
  const [tie] = roundsByMonth([R("t1", 12, 60), R("t2", 3, 60)], ["2026-10"], BXL);
  ok("by month: on a tie the first day", tie.busiest?.day === "2026-10-03" && tie.busiest.items === 40);
  const [empty] = roundsByMonth([], ["2026-08"], BXL);
  ok("by month: an empty month has no busiest day", empty.rounds.length === 0 && empty.busiest === null && empty.minutes === 0);
}

// ── The production list (src/lib/production.ts) ──
import { hourShares, localTime, nextFill, productionPlan, salesBetween, type WeekdaySales } from "../src/lib/production.ts";
{
  // Monday 19 October 2026, Belgian summer time (UTC+2).
  const at = (iso: string) => new Date(iso);
  ok("production: the round after an evening is tomorrow morning", nextFill(at("2026-10-19T15:00:00Z")).toISOString() === "2026-10-20T07:00:00.000Z");
  ok("production: cooking at 3 at night still makes 9 the same morning", nextFill(at("2026-10-20T01:00:00Z")).toISOString() === "2026-10-20T07:00:00.000Z");
  ok("production: at 8 in the morning the next one is tomorrow", nextFill(at("2026-10-20T06:00:00Z")).toISOString() === "2026-10-21T07:00:00.000Z");
  ok("production: winter time keeps 9 o'clock", localTime(nextFill(at("2026-10-26T15:00:00Z"))).hour === 9);
  const flat = hourShares([]);
  const perDay24 = [0, 24, 24, 24, 24, 24, 24, 24];
  ok("production: flat hours, 24 a day is one an hour", Math.abs(salesBetween(perDay24, flat, at("2026-10-19T15:00:00Z"), at("2026-10-20T07:00:00Z")) - 16) < 1e-9);
  const shares = hourShares([{ hour: 12, units: 3 }, { hour: 18, units: 1 }]);
  ok("production: the hours follow the sales", shares[12] === 0.75 && shares[18] === 0.25 && shares[3] === 0);

  // Two followed slots of one dish, 0.75 a day each (6 on every weekday over eight weeks).
  const now = at("2026-10-19T15:00:00Z");
  const sales = (machineId: string, selection: string): WeekdaySales[] =>
    [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ machineId, selection, weekday, units: 6, firstSale: "2026-08-01T10:00:00Z" }));
  const base = {
    now,
    dishes: [{ id: "bami", name: "Bami", photoPath: null, batchMin: 5 }],
    manual: [] as string[],
    slots: [
      { machineId: "m1", selection: "1", productId: "bami", capacity: 2, stock: 1, countedAt: "2026-10-19T07:00:00Z" },
      { machineId: "m1", selection: "3", productId: "bami", capacity: 2, stock: 1, countedAt: "2026-10-19T07:00:00Z" },
    ],
    sales: [...sales("m1", "1"), ...sales("m1", "3")],
    hourUnits: [],
    fridge: [{ productId: "bami", inFridge: 1, madeToday: 0 }],
    trends: [],
    trendPrevStart: "2026-08-24T00:00:00Z",
  };
  const plan = productionPlan(base).lines[0];
  // Until 9 tomorrow (16 h of 24, flat): 0.5 a slot. Each slot then holds 0.5 and needs 1.5.
  ok("production: what the round will need", plan.need === 3 && plan.emptyNow === 2 && plan.sells === 1);
  ok("production: short after the fridge, made as at least a batch", plan.inFridge === 1 && plan.make === 5);
  ok("production: a fridge that covers it makes nothing", productionPlan({ ...base, fridge: [{ productId: "bami", inFridge: 4, madeToday: 0 }] }).lines[0].make === 0);
  ok("production: a fridge never counted makes nothing blind, but says what is needed", (() => {
    const line = productionPlan({ ...base, fridge: [] }).lines[0];
    return line.inFridge === null && line.make === 0 && line.need === 3;
  })());
  const manual = productionPlan({ ...base, manual: ["m1"] }).lines[0];
  ok("production: a machine filled by hand needs a day's sales", manual.need === 2 && manual.emptyNow === 0);
  const stale = productionPlan({ ...base, slots: base.slots.map((s) => ({ ...s, countedAt: "2026-10-14T07:00:00Z" })) }).lines[0];
  ok("production: stock not counted for days is not trusted", stale.need === 2);
  const trend = (units: number, prevUnits: number, firstSale: string | null) =>
    productionPlan({ ...base, trends: [{ productId: "bami", units, prevUnits, firstSale }] }).lines[0].trend;
  ok("production: a trend only when it is real", trend(60, 30, null) === null && trend(100, 40, null) === "up" && trend(40, 100, null) === "down");
  ok("production: a dish new since the earlier weeks has no trend", trend(100, 40, "2026-09-01T00:00:00Z") === null);
}

// ── Revenue per machine on the owner's overview (src/lib/overview.ts) ──
import { PERIODS, revenueByMachine, withoutOrgName } from "../src/lib/overview.ts";
{
  ok("overview: periods are a real list (not a client stand-in)", Array.isArray(PERIODS) && PERIODS.join() === "today,week,month");
  ok("overview: the owner's own name drops off a machine's name", withoutOrgName("Koekelare Chens Garden", "Chens Garden") === "Koekelare");
  ok("overview: a name that is only the org's name stays", withoutOrgName("Chens Garden", "Chens Garden") === "Chens Garden" && withoutOrgName("NATHALIE_SNOEP", "Chens Garden") === "NATHALIE_SNOEP");
  const row = (id: string, revenue: number, units: number) => ({ machine_id: id, machine_name: id, business_name: null, first_sale: "2026-01-01T00:00:00Z", revenue, units, prev_revenue: revenue, prev_units: units });
  const report = (rows: ReturnType<typeof row>[]) => ({
    period: "today", timezone: "Europe/Brussels", cur_start: "", cur_end: "", prev_start: "2026-09-01T00:00:00Z", prev_end: "", first_sale: "2026-01-01T00:00:00Z",
    totals: { revenue: rows.reduce((s, r) => s + r.revenue, 0), units: rows.reduce((s, r) => s + r.units, 0), prev_revenue: rows.reduce((s, r) => s + r.revenue, 0), prev_units: rows.reduce((s, r) => s + r.units, 0) },
    by_day: [], by_hour: [], by_weekday: [], by_machine: rows, by_product: [],
  }) as never;
  const machine = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: `${id} Chens Garden`, type: "lift", payter_serial_number: "APO1", photo_path: null, last_connected_at: null, last_disconnected_at: null, refill_manual: false, ...extra }) as never;
  const built = revenueByMachine({
    reports: { today: report([row("a", 40, 4)]), week: report([row("a", 200, 20), row("b", 90, 9)]), month: report([row("a", 800, 80), row("b", 400, 40)]) },
    machines: [machine("a"), machine("b", { payter_serial_number: null }), machine("c", { refill_manual: true })],
    stock: [{ machine_id: "a", selection_number: "1", product_id: "p", capacity: 10, stock: 5 }, { machine_id: "c", selection_number: "1", product_id: "p", capacity: 10, stock: 10 }] as never,
    refills: new Map([["a", { at: "2026-10-19T07:00:00Z", by: "Alus", pieces: 9 }]]),
    orgName: "Chens Garden",
    newSince: () => undefined,
  });
  const of = (id: string) => built.machines.find((mc) => mc.id === id)!;
  ok("overview: each machine has today, week and month", of("a").figures.today.revenue === 40 && of("a").figures.week.revenue === 200 && of("b").figures.month.revenue === 400);
  ok("overview: a machine without sales in a period has 0, not missing", of("b").figures.today.revenue === 0 && of("c").figures.week.units === 0);
  ok("overview: the total is all machines together", built.totals.week.revenue === 290 && built.totals.month.units === 120);
  ok("overview: how full from counted slots; none for one filled by hand", of("a").fill?.percent === 50 && of("c").fill === null);
  ok("overview: late sales without our terminal; last fill kept", of("b").late && !of("a").late && of("a").lastRefill?.pieces === 9 && of("b").lastRefill === null);
  ok("overview: names without the org's own name", of("a").name === "a");
}

// ── "Vul route beginnen" for the owner too (src/lib/refill-start.ts) ──
import { ownRound, startable } from "../src/lib/refill-start.ts";
{
  const mc = (id: string, refill_manual = false) => ({ id, refill_manual });
  const slots = [
    { machine_id: "a", product_id: "p" },
    { machine_id: "b", product_id: "p" },
    { machine_id: "c", product_id: null },
    { machine_id: "d", product_id: "p" },
    { machine_id: "e", product_id: "p" },
  ];
  const start = startable([mc("a"), mc("b"), mc("c"), mc("d", true), mc("e")], slots, [{ machines: [{ id: "e", done: false }, { id: "a", done: true }] }], ["b", "a"]);
  ok("start: machines with a product, in the route's order, the rest after", start.ids.join() === "b,a");
  ok("start: none filled by hand, none without a product", !start.ids.includes("d") && !start.ids.includes("c"));
  ok("start: one still on an open round is left off; one done on it is not", start.busy.has("e") && !start.ids.includes("e") && start.ids.includes("a"));

  // Newest first, as getOpenRounds gives them.
  const round = (id: string, mine: boolean, readyAt: string | null = null) => ({ id, mine, readyAt });
  ok("own round: the one under way before a newer unstarted one", ownRound([round("new", true), round("out", true, "2026-10-20T08:00:00Z")])?.id === "out");
  ok("own round: else the newest of one's own", ownRound([round("x", false, "2026-10-20T08:00:00Z"), round("b", true), round("a", true)])?.id === "b");
  ok("own round: someone else's is never it", ownRound([round("x", false, "2026-10-20T08:00:00Z")]) === null);
}

// ── "Terugzetten naar …%": what a round's stops changed (src/lib/refill-flow.ts) ──
import { stopChanges } from "../src/lib/refill-flow.ts";
{
  const ev = (selection: string, delta: number, at: string, note: string | null = null) => ({
    machine_id: "m",
    selection_number: selection,
    delta,
    note,
    occurred_at: `2026-10-20T${at}:00Z`,
  });
  const changed = stopChanges([
    ev("11", 4, "08:00"),
    ev("11", -1, "08:00", "expired"),
    ev("12", 3, "08:00"),
    ev("12", -3, "08:10", "reopened"),
    ev("12", 2, "08:20"),
    ev("13", 5, "08:00"),
    ev("13", -5, "08:10", "reopened"),
  ]);
  ok("revert: every event of the stop counts, a removal too", changed["m:11"] === 3);
  ok("revert: only what came after the last reopening", changed["m:12"] === 2);
  ok("revert: a slot put back is nothing to put back again", (changed["m:13"] ?? 0) === 0);
}
