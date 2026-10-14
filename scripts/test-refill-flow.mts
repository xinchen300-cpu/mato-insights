// Checks the refill round logic (src/lib/refill-flow.ts). Run: npm run test:flow
import { uncovered } from "../src/lib/assignments.ts";
import { cleanRoundSettings, DEFAULT_ROUND_SETTINGS } from "../src/lib/round-settings.ts";
import { allocate, itemReport, roundActual, roundCost, levelAfter, onlyMine, pickList, returnsFor, roundTimings, slotKey, pickKey, type FlowLine } from "../src/lib/refill-flow.ts";
import type { RefillLine, RefillSheet } from "../src/lib/types.ts";
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

