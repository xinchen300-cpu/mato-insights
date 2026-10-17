// The step-by-step refill round ("flow v2"): pure logic, no database, so it can
// be checked on its own. The person filling picks, drives, looks and fills; this
// works out what to take, how what was taken spreads over the slots, what each
// slot holds afterwards, and what goes back.

import type { RefillSheet } from "@/lib/types";

export type FlowLine = {
  machineId: string;
  selection: string;
  row: number;
  slot: number;
  productId: string;
  productName: string;
  photoPath: string | null;
  capacity: number;
  /**
   * What Vendly thinks is in the slot right now, or null when it does not
   * know: never counted, or more sold since the count than was in it. Unknown
   * is never shown as empty or as full.
   */
  stock: number | null;
  /** How many to take from storage for this slot. */
  take: number;
  /** Units the shelf life says are past their date: out first. */
  expired: number;
};

/** What a slot holds now, whether or not the round fills it. */
export type SlotProduct = { machineId: string; selection: string; productId: string; productName: string | null };

export type RemovalReason = "expired" | "damaged" | "nearExpiry" | "other";
export const REMOVAL_REASONS: RemovalReason[] = ["expired", "damaged", "nearExpiry", "other"];

/** One slot at one stop, as it was left. */
export type StopLine = {
  selection: string;
  prepared: number;
  filled: number;
  removed: { reason: RemovalReason; qty: number }[];
  /** "How many are in it now?", answered after filling. */
  countAfter: number | null;
  /** Seen full with one's own eyes ("Ja, vol"). */
  full: boolean;
};

export type StopRecord = {
  checkedAt: string | null;
  completedAt: string | null;
  skipped: boolean;
  technical: boolean;
  note: string | null;
  lines: StopLine[];
  /** The operator's own checks at this machine (Werkwijze), and whether each was ticked. */
  checks?: Record<string, boolean>;
};

export type Disposition = "stock" | "waste" | "promo" | "staff" | "other";
export const DISPOSITIONS: Disposition[] = ["stock", "waste", "promo", "staff", "other"];

export type ReturnRow = {
  productId: string;
  productName: string;
  source: "leftover" | "removed";
  reason: RemovalReason | null;
  disposition: Disposition;
  qty: number;
};

export const pickKey = (machineId: string, productId: string) => `${machineId}:${productId}`;
export const slotKey = (machineId: string, selection: string) => `${machineId}:${selection}`;

export type PickRow = { key: string; machineId: string; productId: string; productName: string; photoPath: string | null; take: number };

/** What to take from storage, per machine and product, in the machine's own slot order. */
export function pickList(lines: FlowLine[]): PickRow[] {
  const rows = new Map<string, PickRow>();
  for (const line of [...lines].sort((a, b) => a.row - b.row || a.slot - b.slot)) {
    const key = pickKey(line.machineId, line.productId);
    const row = rows.get(key) ?? {
      key,
      machineId: line.machineId,
      productId: line.productId,
      productName: line.productName,
      photoPath: line.photoPath,
      take: 0,
    };
    row.take += line.take;
    rows.set(key, row);
  }
  return [...rows.values()].filter((row) => row.take > 0);
}

/**
 * Spread what was actually picked over the slots that asked for it. The
 * emptiest slots first (and the ones Vendly cannot see into count as empty),
 * so a shortage leaves the fullest slots short rather than an empty one.
 */
export function allocate(lines: FlowLine[], picked: Record<string, number>): Record<string, number> {
  const groups = new Map<string, FlowLine[]>();
  for (const line of lines) {
    const key = pickKey(line.machineId, line.productId);
    groups.set(key, [...(groups.get(key) ?? []), line]);
  }
  const prepared: Record<string, number> = {};
  for (const [key, group] of groups) {
    let left = Math.max(0, Math.floor(picked[key] ?? 0));
    const ordered = [...group].sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0) || a.row - b.row || a.slot - b.slot);
    for (const line of ordered) {
      const give = Math.min(line.take, left);
      prepared[slotKey(line.machineId, line.selection)] = give;
      left -= give;
    }
  }
  return prepared;
}

/**
 * What a slot holds after the stop. A count wins; then "seen full"; otherwise
 * what was in it plus what went in, capped at what fits. A slot Vendly could
 * not see into stays unknown unless somebody looked — or a whole slot's worth
 * went in, which only fits in an empty slot, so it is full now. The plan takes
 * exactly that for a slot it cannot see into. Null means "write nothing".
 */
export function levelAfter(line: Pick<FlowLine, "capacity">, stockNow: number | null, stop: StopLine): number | null {
  const cap = line.capacity;
  if (stop.countAfter !== null) return Math.min(cap, Math.max(0, Math.round(stop.countAfter)));
  if (stop.full) return cap;
  if (stockNow === null) return stop.filled >= cap ? cap : null;
  const removed = stop.removed.reduce((sum, r) => sum + r.qty, 0);
  return Math.min(cap, Math.max(0, stockNow - removed) + stop.filled);
}

/**
 * What comes back from the round: per product, what was picked and not filled
 * (skipped stops included), and everything taken out of a machine, each with
 * the most likely destination already chosen. Something can be taken out of a
 * slot the round did not plan to fill, so `slots` is every slot of the round's
 * machines; for a planned slot the plan's product wins.
 */
export function returnsFor(
  lines: FlowLine[],
  slots: SlotProduct[],
  picked: Record<string, number>,
  stops: Record<string, StopRecord>,
): ReturnRow[] {
  const names = new Map<string, string>([
    ...slots.map((slot) => [slot.productId, slot.productName ?? "—"] as const),
    ...lines.map((line) => [line.productId, line.productName] as const),
  ]);
  const productOf = new Map<string, string>([
    ...slots.map((slot) => [slotKey(slot.machineId, slot.selection), slot.productId] as const),
    ...lines.map((line) => [slotKey(line.machineId, line.selection), line.productId] as const),
  ]);

  const leftover = new Map<string, number>();
  for (const [key, qty] of Object.entries(picked)) {
    const productId = key.slice(key.indexOf(":") + 1);
    leftover.set(productId, (leftover.get(productId) ?? 0) + Math.max(0, qty));
  }
  const removed = new Map<string, number>();
  for (const [machineId, stop] of Object.entries(stops)) {
    for (const line of stop.lines) {
      const productId = productOf.get(slotKey(machineId, line.selection));
      if (!productId) continue;
      leftover.set(productId, (leftover.get(productId) ?? 0) - line.filled);
      for (const r of line.removed) {
        const key = `${productId}|${r.reason}`;
        removed.set(key, (removed.get(key) ?? 0) + r.qty);
      }
    }
  }

  const rows: ReturnRow[] = [];
  for (const [productId, qty] of leftover) {
    if (qty > 0) {
      rows.push({ productId, productName: names.get(productId) ?? "—", source: "leftover", reason: null, disposition: "stock", qty });
    }
  }
  for (const [key, qty] of removed) {
    if (qty <= 0) continue;
    const [productId, reason] = key.split("|") as [string, RemovalReason];
    rows.push({
      productId,
      productName: names.get(productId) ?? "—",
      source: "removed",
      reason,
      disposition: reason === "nearExpiry" ? "promo" : "waste",
      qty,
    });
  }
  return rows.sort((a, b) => (a.source === b.source ? a.productName.localeCompare(b.productName) : a.source === "leftover" ? -1 : 1));
}

/**
 * One van run often covers two customers' machines, and one fridge often holds
 * two shops. Owning a machine on the run is not a reason to read the rest of
 * it: the sheet comes back with only the caller's own machines, and on those
 * only the slots and products that are the caller's own — the same line
 * getMachineStock draws for a co-tenant's slots.
 */
export type ShopView = { machines: string[]; products: Set<string>; slots: Set<string> };

export function onlyMine(sheet: RefillSheet, view: ShopView): RefillSheet {
  const lines = sheet.lines.filter((line) => view.machines.includes(line.machine_id) && view.products.has(line.product_id));
  const own = new Set([...view.slots, ...lines.map((line) => slotKey(line.machine_id, line.selection_number))]);
  return {
    ...sheet,
    // The filler's link opens the whole run, every machine on the round, so a
    // shop never gets it: it would hand over the co-tenant's slots in one click.
    share_token: "",
    // Who filled is the operator's staff; their e-mail address is not the shop's.
    filled_by: null,
    // The operator's note is for their filler, and on a shared run it can be
    // about the co-tenant's machine.
    notes: null,
    machine_ids: sheet.machine_ids.filter((id) => view.machines.includes(id)),
    lines,
    // Flow 2 keeps progress per machine and the box per machine and product.
    stops: Object.fromEntries(
      Object.entries(sheet.stops ?? {})
        .filter(([id]) => view.machines.includes(id))
        .map(([id, stop]) => [id, { ...stop, lines: stop.lines.filter((line) => own.has(slotKey(id, line.selection))) }]),
    ),
    // What came back is per product: the co-tenant's leftovers are not the shop's.
    returns: (sheet.returns ?? []).filter((row) => view.products.has(row.productId)),
    box:
      sheet.flow_version === 2
        ? Object.fromEntries(
            Object.entries(sheet.box ?? {}).filter(([key]) => {
              const [machineId, productId] = key.split(":");
              return view.machines.includes(machineId) && view.products.has(productId);
            }),
          )
        : Object.fromEntries(Object.entries(sheet.box ?? {}).filter(([productId]) => view.products.has(productId))),
  };
}

/** One product's line in the report of a finished round. */
export type ItemReport = {
  productId: string;
  name: string;
  /** Out of the fridge into the van. */
  taken: number;
  /** Into the machines. */
  filled: number;
  /** Taken along, not used, brought back. */
  back: number;
  /** Taken out of the machines, per reason. */
  out: Record<RemovalReason, number>;
  /** Asked for, but not in the fridge. */
  short: number;
  /** Where what came back (unused or taken out) went. */
  went: Partial<Record<Disposition, number>>;
};

/**
 * What happened to each product on a finished round, from what the filler
 * entered: taken from the fridge, filled, brought back, taken out and why,
 * and short. Only products with something to say about them.
 */
export function itemReport(
  lines: { machine_id: string; selection_number: string; product_id: string; product_name: string }[],
  box: Record<string, number>,
  stops: Record<string, StopRecord>,
  returns: ReturnRow[],
  shortages: { productId: string; qty: number }[],
): ItemReport[] {
  const rows = new Map<string, ItemReport>();
  const row = (productId: string, name: string) => {
    const existing = rows.get(productId);
    if (existing) return existing;
    const fresh: ItemReport = {
      productId,
      name,
      taken: 0,
      filled: 0,
      back: 0,
      out: { expired: 0, damaged: 0, nearExpiry: 0, other: 0 },
      short: 0,
      went: {},
    };
    rows.set(productId, fresh);
    return fresh;
  };
  const names = new Map(lines.map((line) => [line.product_id, line.product_name]));
  const productOf = new Map(lines.map((line) => [slotKey(line.machine_id, line.selection_number), line.product_id]));
  const nameOf = (productId: string) => names.get(productId) ?? "—";

  for (const [key, qty] of Object.entries(box)) {
    const productId = key.slice(key.indexOf(":") + 1);
    if (qty > 0) row(productId, nameOf(productId)).taken += qty;
  }
  for (const [machineId, stop] of Object.entries(stops)) {
    for (const line of stop.lines) {
      const productId = productOf.get(slotKey(machineId, line.selection));
      if (productId && line.filled > 0) row(productId, nameOf(productId)).filled += line.filled;
    }
  }
  for (const item of returns) {
    if (item.qty <= 0) continue;
    const entry = row(item.productId, names.get(item.productId) ?? item.productName);
    if (item.source === "leftover") entry.back += item.qty;
    else if (item.reason) entry.out[item.reason] += item.qty;
    entry.went[item.disposition] = (entry.went[item.disposition] ?? 0) + item.qty;
  }
  for (const item of shortages) {
    if (item.qty > 0) row(item.productId, nameOf(item.productId)).short += item.qty;
  }
  return [...rows.values()].sort((a, b) => b.filled - a.filled || a.name.localeCompare(b.name));
}

/** A finished step-by-step round, as far as its clock goes. */
export type TimedRound = {
  filledBy: string | null;
  readyAt: string;
  completedAt: string;
  stops: Record<string, StopRecord>;
};

/** An average and how many times it was measured: one round is no habit. */
export type Average = { minutes: number; count: number };
export type FillerTimes = {
  /** As they gave it when they started; null when the round has no name. */
  name: string | null;
  rounds: number;
  lastAt: string;
  /** "Start ronde" to "Afronden". */
  round: Average;
  /** Machines visited per round, so a long round is not read as a slow filler. */
  machinesPerRound: number;
  /** Opening a machine to done, over all their visits. */
  atMachine: Average;
};
export type RoundTimings = {
  fillers: FillerTimes[];
  /** Per machine id: the work there, opened to done. */
  machines: Record<string, Average>;
  /** Per "from→to": the drive, done to opened. "start" is "Start ronde", "end" is "Afronden". */
  legs: Record<string, Average>;
};

// Longer than this is a clock left running, or a phone with the wrong time.
const MAX_STEP = 8 * 60;
const MAX_ROUND = 12 * 60;

type Tally = { sum: number; count: number };
const tally = (): Tally => ({ sum: 0, count: 0 });
function count(into: Tally, minutes: number, max: number): boolean {
  if (!(minutes > 0 && minutes < max)) return false;
  into.sum += minutes;
  into.count += 1;
  return true;
}
const average = (from: Tally): Average => ({ minutes: from.count ? from.sum / from.count : 0, count: from.count });
const minutesBetween = (from: string, to: string) => (new Date(to).getTime() - new Date(from).getTime()) / 60000;

/**
 * What finished rounds say about time: the whole round, the work at each
 * machine, and each drive in between, in the order the filler really went (by
 * the moment they opened each machine). A skipped machine is no visit, and a
 * drive with a skip in it is not measured: nobody knows where it went.
 */
export function roundTimings(rounds: TimedRound[]): RoundTimings {
  const machines: Record<string, Tally> = {};
  const legs: Record<string, Tally> = {};
  const people = new Map<string, { name: string | null; rounds: number; lastAt: string; round: Tally; visits: number; atMachine: Tally }>();

  for (const round of rounds) {
    const entries = Object.entries(round.stops ?? {});
    const visits = entries
      .filter(([, stop]) => !stop.skipped && stop.checkedAt && stop.completedAt)
      .map(([machineId, stop]) => ({ machineId, arrived: stop.checkedAt!, done: stop.completedAt! }))
      .sort((a, b) => a.arrived.localeCompare(b.arrived));
    const skips = entries.filter(([, stop]) => stop.skipped && stop.completedAt).map(([, stop]) => stop.completedAt!);

    const name = round.filledBy?.trim() || null;
    const key = name?.toLocaleLowerCase() ?? "";
    const person = people.get(key) ?? { name, rounds: 0, lastAt: round.completedAt, round: tally(), visits: 0, atMachine: tally() };
    person.rounds += 1;
    person.visits += visits.length;
    if (round.completedAt > person.lastAt) person.lastAt = round.completedAt;
    count(person.round, minutesBetween(round.readyAt, round.completedAt), MAX_ROUND);
    people.set(key, person);

    const drive = (from: string, left: string, to: string, arrived: string) => {
      if (skips.some((at) => at >= left && at <= arrived)) return;
      count((legs[`${from}→${to}`] ??= tally()), minutesBetween(left, arrived), MAX_STEP);
    };
    let previous = { machineId: "start", done: round.readyAt };
    for (const visit of visits) {
      const here = minutesBetween(visit.arrived, visit.done);
      count((machines[visit.machineId] ??= tally()), here, MAX_STEP);
      count(person.atMachine, here, MAX_STEP);
      drive(previous.machineId, previous.done, visit.machineId, visit.arrived);
      previous = visit;
    }
    if (visits.length > 0) drive(previous.machineId, previous.done, "end", round.completedAt);
  }

  const averages = (from: Record<string, Tally>) =>
    Object.fromEntries(Object.entries(from).filter(([, v]) => v.count > 0).map(([key, v]) => [key, average(v)]));
  return {
    fillers: [...people.values()]
      .map((v) => ({
        name: v.name,
        rounds: v.rounds,
        lastAt: v.lastAt,
        round: average(v.round),
        machinesPerRound: v.rounds ? v.visits / v.rounds : 0,
        atMachine: average(v.atMachine),
      }))
      .sort((a, b) => b.lastAt.localeCompare(a.lastAt)),
    machines: averages(machines),
    legs: averages(legs),
  };
}

export type RoundCost = {
  minutes: number;
  km: number | null;
  /** Where the kilometres came from: written on the round, added up along the route, or the one machine's distance there and back. */
  kmFrom: "round" | "route" | "machine" | null;
  time: number;
  /** Null while nobody wrote the kilometres down: unknown, never zero. */
  drive: number | null;
  total: number;
};

/**
 * What a round cost: its time at the hourly rate plus its kilometres at the
 * kilometre rate, as set in Settings. The kilometres are the ones the owner
 * wrote on the round; otherwise its stops added up from the route's distances;
 * a round to a single machine falls back to that machine's distance there and
 * back. Without any of them, only the time is counted.
 */
export function roundCost(input: {
  minutes: number;
  km: number | null;
  /** The round's own stops added up from the route's distances, when every leg has one. */
  routeKm?: number | null;
  /** The distance there and back of every machine the round went to, where it is known. */
  machineKm: (number | null)[];
  perHour: number;
  perKm: number;
}): RoundCost {
  const single = input.machineKm.length === 1 ? input.machineKm[0] : null;
  const route = input.routeKm ?? null;
  const km = input.km ?? route ?? single ?? null;
  const kmFrom = input.km !== null ? "round" : route !== null ? "route" : single !== null ? "machine" : null;
  const time = (input.minutes / 60) * input.perHour;
  const drive = km === null ? null : km * input.perKm;
  return { minutes: input.minutes, km, kmFrom, time, drive, total: time + (drive ?? 0) };
}

/**
 * What really happened on a finished step-by-step round, for every screen and
 * paper that would otherwise show the plan: per product out of the fridge, per
 * slot into the machine, and the machines that were skipped. Null for a round
 * that is still open, or one filled the old way.
 */
export function roundActual(
  sheet: RefillSheet,
  shortages: { productId: string; qty: number }[],
): { items: ItemReport[]; actual: { taken: Record<string, number>; filled: Record<string, number>; skipped: string[] } } | null {
  if (sheet.flow_version !== 2 || !sheet.completed_at) return null;
  const stops = Object.entries(sheet.stops ?? {});
  const items = itemReport(sheet.lines, sheet.box ?? {}, sheet.stops ?? {}, sheet.returns ?? [], shortages);
  return {
    items,
    actual: {
      taken: Object.fromEntries(items.map((item) => [item.productId, item.taken])),
      filled: Object.fromEntries(
        stops.flatMap(([machineId, stop]) => stop.lines.map((line) => [slotKey(machineId, line.selection), line.filled])),
      ),
      skipped: stops.filter(([, stop]) => stop.skipped).map(([machineId]) => machineId),
    },
  };
}
