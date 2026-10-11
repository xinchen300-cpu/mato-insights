// Checks the refill round logic (src/lib/refill-flow.ts). Run: npm run test:flow
import { allocate, levelAfter, onlyMine, pickList, returnsFor, slotKey, pickKey, type FlowLine } from "../src/lib/refill-flow.ts";
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
ok("unknown without looking stays unknown", levelAfter({ capacity: 2 }, null, base) === null);
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
  stops: { fridge: stop(["11", "12", "13", "14"]), other: stop(["11"]) } } as unknown as RefillSheet;
const view = { machines: ["fridge"], products: new Set(["mine-a"]), slots: new Set([slotKey("fridge", "13")]) };
const seenByShop = onlyMine(shared, view);
ok("shop: only its own machine", seenByShop.machine_ids.join() === "fridge" && !("other" in seenByShop.stops));
ok("shop: only its own product's lines", seenByShop.lines.length === 1 && seenByShop.lines[0].product_id === "mine-a");
ok("shop: stop lines only for its slots (planned 11, own unplanned 13)", seenByShop.stops.fridge.lines.map((l) => l.selection).join() === "11,13");
ok("shop: box only its own product on its machine", Object.keys(seenByShop.box).join() === "fridge:mine-a");
ok("shop: no share link", seenByShop.share_token === "");
const nothing = onlyMine(shared, { machines: [], products: new Set(), slots: new Set() });
ok("shop with nothing sees nothing", !nothing.machine_ids.length && !nothing.lines.length && !Object.keys(nothing.stops).length && !Object.keys(nothing.box).length);
