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
const custom = cleanRoundSettings({ checks: ["  Ruit  gepoetst ", "ruit gepoetst", "", 3, "x".repeat(90)], message: "  Koelbox terug  ", askKm: false, notify: { eachMachine: true }, extra: 1 });
ok("settings: checks trimmed, kept once, capped", custom.checks.length === 2 && custom.checks[0] === "Ruit gepoetst" && custom.checks[1].length === 60);
ok("settings: message trimmed, flags kept, the rest default", custom.message === "Koelbox terug" && custom.askKm === false && custom.allowSkip === true && custom.notify.eachMachine && custom.notify.start && custom.notify.finish);
ok("settings: at most eight checks", cleanRoundSettings({ checks: Array.from({ length: 12 }, (_, i) => `check ${i}`) }).checks.length === 8);

// Money shown, pieces tested: only a change both agree on is real.
ok("money: pieces and money up is up", compareMoneySince(200, 100, 800, 500, null, "2026-09-01") === "up");
ok("money: more pieces for less money is noise, not up", compareMoneySince(200, 100, 450, 500, null, "2026-09-01") === "noise");
ok("money: fewer pieces for more money is noise, not down", compareMoneySince(50, 100, 520, 500, null, "2026-09-01") === "noise");
ok("money: too few stays too few", compareMoneySince(10, 8, 50, 20, null, "2026-09-01") === "tooFew");

// ── A filler's own figures (src/lib/filler-stats.ts) and the time rules in stats.ts ──
import { compareTimes, isRecord, MIN_ROUNDS } from "../src/lib/stats.ts";
import { fillerStats, levelFor, progressFrame, roundEta, roundResult, roundReward, summarizeRound, type MyRound } from "../src/lib/filler-stats.ts";
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
ok("reward: a first round compares with nothing, and earns the first badge", first.verdict === "tooFew" && !first.record && first.newBadges.join() === "first");
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
ok("reward: crossing 1.000 pieces earns that badge, with the level before and after", big.newBadges.includes("items1000") && big.before.items === 960 && big.after.items === 1020 && big.after.level === 5);

const stats = fillerStats([...history, R("q", 8, 50), R("w", 13, 70, { machines: ["c"] }), R("w2", 14, 66, { skip: true })], "Europe/Brussels", new Date(on(15, 12)));
ok("stats: totals over every round", stats.rounds === 6 && stats.items === 4 * 40 + 20 + 20 && stats.visits === 10);
ok("stats: this week is Monday 12 October on", stats.week.rounds === 2 && stats.week.items === 40);
ok("stats: records counted, the newest one remembered", stats.records === 1 && stats.lastRecord?.minutes === 50 && stats.lastRecord.at === R("q", 8, 50).completedAt);
const route = stats.routes[0];
ok("stats: per route the best, the usual and the last complete time", route.rounds === 4 && route.best === 50 && route.usual === 59 && route.last === null);
ok("stats: a record is marked on its round, newest first", stats.recent[0].id === "w2" && stats.recent.find((r) => r.id === "q")?.record === true);
ok("stats: the record badge is earned when the record was set", stats.badges.find((b) => b.id === "record")?.earnedAt === R("q", 8, 50).completedAt);

const legs = { "start→a": { minutes: 10, count: 2 }, "b→a": { minutes: 15, count: 1 }, "b→end": { minutes: 12, count: 2 } };
const machinesAt = { a: { minutes: 8, count: 2 }, b: { minutes: 6, count: 2 } };
const t0 = Date.parse(on(16, 8));
ok("eta: the drives and the work still ahead, then back", roundEta({ remaining: ["a", "b"], from: "start", since: on(16, 8), times: { machines: machinesAt, legs }, now: t0 }) === t0 + (10 + 8 + 15 + 6 + 12) * 60_000);
ok("eta: never before now", roundEta({ remaining: ["b"], from: "a", since: on(16, 8), times: { machines: machinesAt, legs }, now: t0 + 60 * 60_000 }) === t0 + (60 + 6 + 12) * 60_000);
ok("eta: one drive never measured is no estimate", roundEta({ remaining: ["a", "c"], from: "start", since: on(16, 8), times: { machines: machinesAt, legs }, now: t0 }) === null);
ok("eta: only the way back is left", roundEta({ remaining: [], from: "b", since: on(16, 8), times: { machines: machinesAt, legs }, now: t0 }) === t0 + 12 * 60_000);
ok("frame: what is done before halfway, what is left from halfway", progressFrame(1, 4) === "done" && progressFrame(2, 4) === "left" && progressFrame(0, 1) === "done");
const threeRecords = fillerStats([R("t1", 1, 60), R("t2", 2, 62), R("t3", 3, 58), R("t4", 4, 57), R("t5", 5, 56), R("t6", 6, 59), R("t7", 7, 55)], "Europe/Brussels", new Date(on(15, 12)));
ok("badges: three records earn '3 records', on the round of the third", threeRecords.records === 3 && threeRecords.badges.find((b) => b.id === "records3")?.earnedAt === R("t7", 7, 55).completedAt);
ok("badges: no badge counts rounds without a skip", !threeRecords.badges.some((b) => (b.id as string).startsWith("streak")));
