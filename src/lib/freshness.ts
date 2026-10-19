// How old the dishes in the machines are (Xin, 19-10-2026: every dish keeps 12
// days, but not every dish goes in on the day it was cooked). The day a dish
// was cooked comes from the kitchen list: what the operator passes on counts as
// cooked that evening, and the fridge gives out the oldest first. Where that
// day is not known, no date is made up: the filler is asked to read the label.
// Pure logic, checked by npm run test:flow.

import { MONTH_MODE_DAYS, isoDay } from "@/lib/expiry";

/** Pieces of unknown age that have stood this long in a slot get their label read. */
export const UNDATED_CHECK_DAYS = 5;

const DAY = 86_400_000;

export type FridgeEvent = { at: string; kind: string; qty: number; madeOn: string | null };
/** Pieces of one dish in the fridge, oldest first; a null day is one nobody knows. */
export type FridgeLot = { madeOn: string | null; qty: number };
export type Fridge = { counted: boolean; lots: FridgeLot[] };

/** The first n pieces out, oldest first, and what stays. Short of pieces, the rest is of unknown age. */
function takeOut(lots: FridgeLot[], n: number): { taken: FridgeLot[]; rest: FridgeLot[] } {
  const taken: FridgeLot[] = [];
  const rest = lots.map((lot) => ({ ...lot }));
  let left = n;
  while (left > 0 && rest.length > 0) {
    const lot = rest[0];
    const qty = Math.min(lot.qty, left);
    taken.push({ madeOn: lot.madeOn, qty });
    lot.qty -= qty;
    left -= qty;
    if (lot.qty === 0) rest.shift();
  }
  if (left > 0) taken.push({ madeOn: null, qty: left });
  return { taken, rest };
}

/**
 * A followed fridge, from everything that went in and out of it. It gives out
 * the oldest first. A count keeps the newest pieces (the oldest went first)
 * and, above what is known to be in it, puts pieces of unknown age in front.
 * Until the first count nothing in it is known: old pieces may have stood there.
 */
export function fridgeLots(events: FridgeEvent[]): Fridge {
  let lots: FridgeLot[] = [];
  let counted = false;
  for (const event of [...events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    const qty = Math.max(0, Math.floor(event.qty));
    if (event.kind === "made") {
      if (qty > 0) lots.push({ madeOn: event.madeOn, qty });
    } else if (event.kind === "count") {
      counted = true;
      const total = lots.reduce((sum, lot) => sum + lot.qty, 0);
      lots = qty >= total ? [...(qty > total ? [{ madeOn: null, qty: qty - total }] : []), ...lots] : takeOut(lots, total - qty).rest;
    } else {
      lots = takeOut(lots, qty).rest;
    }
  }
  return { counted, lots };
}

/**
 * The day each slot's new pieces were cooked, as they are taken from the
 * fridges in this order: the oldest day among a slot's pieces, so its date is
 * never later than the truth. Null when any of them is of unknown age, or the
 * fridge was never counted.
 */
export function madeDays(fridges: Map<string, Fridge>, fills: { key: string; productId: string; pieces: number }[]): Map<string, string | null> {
  const lots = new Map([...fridges].map(([productId, fridge]) => [productId, fridge.lots]));
  const days = new Map<string, string | null>();
  for (const fill of fills) {
    const fridge = fridges.get(fill.productId);
    if (!fridge || fill.pieces <= 0) {
      days.set(fill.key, null);
      continue;
    }
    const { taken, rest } = takeOut(lots.get(fill.productId) ?? [], fill.pieces);
    lots.set(fill.productId, rest);
    const known = taken.every((lot) => lot.madeOn !== null);
    days.set(fill.key, fridge.counted && known ? taken.map((lot) => lot.madeOn!).sort()[0] : null);
  }
  return days;
}

/** One batch still in a slot, as slot_ages gives it; a slot without batches comes once with no batch. */
export type AgeRow = {
  machineId: string;
  selection: string;
  shelfLifeDays: number;
  /** The dish comes from a producer whose cooking day decides its date. */
  fromProducer: boolean;
  qtyRemaining: number | null;
  filledAt: string | null;
  madeOn: string | null;
  expiresAt: string | null;
};

export type SlotFresh = {
  /** Pieces whose date runs out before the next visit: out now. */
  pull: number;
  /** Of those, already past their date. */
  past: number;
  /** The first date among them. */
  pullBy: string | null;
  /** Pieces of unknown age that may be old: their label is read. */
  check: number;
};

/**
 * Per slot ("machine:selection"), what comes out before the next visit and
 * what needs its label read. A piece has a date when its cooking day is known,
 * or, for a dish not from a producer, from the day it went in. Pieces without
 * one are only asked about for food that keeps a short while, once they stood
 * UNDATED_CHECK_DAYS in the slot or when nobody knows since when.
 */
export function slotFreshness(
  rows: AgeRow[],
  stock: Map<string, number | null>,
  now: Date,
  nextVisit: Date,
): Map<string, SlotFresh> {
  const today = isoDay(now);
  const visitDay = isoDay(nextVisit);
  const bySlot = new Map<string, AgeRow[]>();
  for (const row of rows) {
    const key = `${row.machineId}:${row.selection}`;
    bySlot.set(key, [...(bySlot.get(key) ?? []), row]);
  }
  const fresh = new Map<string, SlotFresh>();
  for (const [key, batches] of bySlot) {
    const inSlot = stock.get(key);
    if (inSlot === null || inSlot === undefined || inSlot <= 0) continue;
    const slot: SlotFresh = { pull: 0, past: 0, pullBy: null, check: 0 };
    const short = batches[0].shelfLifeDays < MONTH_MODE_DAYS;
    let inBatches = 0;
    for (const batch of batches) {
      const qty = batch.qtyRemaining ?? 0;
      if (qty <= 0) continue;
      inBatches += qty;
      const dated = batch.expiresAt !== null && (batch.madeOn !== null || !batch.fromProducer);
      if (dated) {
        if (batch.expiresAt! < visitDay) {
          slot.pull += qty;
          if (batch.expiresAt! < today) slot.past += qty;
          if (slot.pullBy === null || batch.expiresAt! < slot.pullBy) slot.pullBy = batch.expiresAt;
        }
      } else if (short && batch.filledAt !== null && now.getTime() - Date.parse(batch.filledAt) >= UNDATED_CHECK_DAYS * DAY) {
        slot.check += qty;
      }
    }
    // Pieces counted in without a batch: nobody knows since when they stand there.
    if (short) slot.check += Math.max(0, inSlot - inBatches);
    if (slot.pull > 0 || slot.check > 0) fresh.set(key, slot);
  }
  return fresh;
}
