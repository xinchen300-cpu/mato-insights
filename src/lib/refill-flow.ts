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
    machine_ids: sheet.machine_ids.filter((id) => view.machines.includes(id)),
    lines,
    // Flow 2 keeps progress per machine and the box per machine and product.
    stops: Object.fromEntries(
      Object.entries(sheet.stops ?? {})
        .filter(([id]) => view.machines.includes(id))
        .map(([id, stop]) => [id, { ...stop, lines: stop.lines.filter((line) => own.has(slotKey(id, line.selection))) }]),
    ),
    box:
      sheet.flow_version === 2
        ? Object.fromEntries(
            Object.entries(sheet.box ?? {}).filter(([key]) => {
              const [machineId, productId] = key.split(":");
              return view.machines.includes(machineId) && view.products.has(productId);
            }),
          )
        : sheet.box,
  };
}
