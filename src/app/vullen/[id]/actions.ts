"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getRefillRound, type RefillRound } from "@/lib/data";
import { requireRefillAccess } from "@/lib/org";
import {
  DISPOSITIONS,
  REMOVAL_REASONS,
  allocate,
  levelAfter,
  pickList,
  returnsFor,
  slotKey,
  type Disposition,
  type RemovalReason,
  type StopLine,
  type StopRecord,
} from "@/lib/refill-flow";
import { fmt } from "@/i18n/format";
import { messages } from "@/i18n/messages";
import { displayName } from "@/lib/people";
import { notifyOperators } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { RefillLine } from "@/lib/types";

// Every action takes the round id from the phone, so every action checks it
// again here: the caller's organisation (operator or filler, never a shop),
// the round in it, still open. Products, capacities and what was planned come
// from the round itself, never from what the phone sends.

type Open = { orgId: string; round: RefillRound };

// A notification lands on the operator's phone, whose language Vendly does not
// keep per organisation; like the evening digest, it speaks Dutch.
const PUSH = messages.nl.round;

async function openRound(sheetId: string): Promise<Open> {
  const orgId = await requireRefillAccess();
  const round = await getRefillRound(orgId, sheetId);
  // Old rounds are filled through their share link; mixing the two would write stock twice.
  if (!round || round.flowVersion !== 2) throw new Error("Not found");
  if (round.completedAt) throw new Error("Round is closed");
  return { orgId, round };
}

const whole = (value: unknown, max: number) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : null;
};

/** Only the products this round asks for, each at most what it asks for. */
function cleanPicked(round: RefillRound, picked: Record<string, number>): Record<string, number> {
  const asked = new Map(pickList(round.lines).map((row) => [row.key, row.take]));
  const clean: Record<string, number> = {};
  for (const [key, take] of asked) {
    const n = whole(picked[key], 999);
    if (n !== null) clean[key] = Math.min(n, take);
  }
  return clean;
}

/**
 * Who is filling, as the operator should read it: the name they gave when
 * they signed up, or else the part of their address before the @.
 */
async function fillerName(): Promise<string | null> {
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  return displayName(user);
}

/** What is in the box so far, kept on the round so another phone can carry on. */
export async function savePicked(sheetId: string, picked: Record<string, number>): Promise<void> {
  const { orgId, round } = await openRound(sheetId);
  if (round.readyAt) return;
  await createAdminClient()
    .from("refill_sheets")
    .update({ box: cleanPicked(round, picked) })
    .eq("id", sheetId)
    .eq("org_id", orgId)
    // A late save from a second phone must not change the box once the round has started.
    .is("ready_at", null)
    .is("completed_at", null);
}

/**
 * "Start ronde": the box is final, the clock starts, and what could not be
 * taken from storage is written down once, for the producer list.
 */
export async function startRound(sheetId: string, picked: Record<string, number>): Promise<void> {
  const { orgId, round } = await openRound(sheetId);
  if (round.readyAt) return;
  const box = cleanPicked(round, picked);
  const now = new Date().toISOString();
  const admin = createAdminClient();
  const who = await fillerName();

  const { data: updated } = await admin
    .from("refill_sheets")
    .update({ box, ready_at: now, started_at: round.startedAt ?? now, filled_by: who })
    .eq("id", sheetId)
    .eq("org_id", orgId)
    .is("ready_at", null)
    .select("id");
  // Only the call that actually started the round writes the shortages, and says so.
  if (!updated?.length) return;
  after(() =>
    notifyOperators(orgId, {
      title: "Vendly",
      body: fmt(round.machines.length === 1 ? PUSH.pushStartedOne : PUSH.pushStarted, {
        name: who ?? PUSH.pushSomeone,
        count: round.machines.length,
      }),
      url: `/refill/${sheetId}`,
      tag: `round-${sheetId}`,
    }),
  );

  const short = pickList(round.lines)
    .map((row) => ({ productId: row.productId, qty: row.take - (box[row.key] ?? 0) }))
    .filter((row) => row.qty > 0);
  const perProduct = new Map<string, number>();
  for (const row of short) perProduct.set(row.productId, (perProduct.get(row.productId) ?? 0) + row.qty);
  if (perProduct.size) {
    await admin.from("run_shortages").insert(
      [...perProduct].map(([productId, qty]) => ({ org_id: orgId, sheet_id: sheetId, product_id: productId, qty })),
    );
  }
  revalidatePath("/refill");
}

export type StopInput = {
  checkedAt: string | null;
  technical: boolean;
  note: string | null;
  lines: { selection: string; filled: number; removed: { reason: string; qty: number }[]; countAfter: number | null; full: boolean }[];
};

/**
 * A machine is done. Each slot gets one new level: what was in it plus what
 * went in, or what was counted, or full when somebody saw it full. A slot
 * Vendly could not see into, and nobody looked at, is left alone.
 */
export async function completeStop(sheetId: string, machineId: string, input: StopInput): Promise<void> {
  const { orgId, round } = await openRound(sheetId);
  if (!round.machines.some((machine) => machine.id === machineId)) throw new Error("Not found");
  if (!round.readyAt) throw new Error("Round not started");
  if (round.stops[machineId]?.completedAt) return;

  const slots = new Map(round.slots.filter((s) => s.machineId === machineId).map((s) => [s.selection, s]));
  const prepared = allocate(round.lines, round.picked);

  // The phone's list is read once per slot, and what came out of a slot is
  // one number per reason and never more than the slot can hold: a doubled
  // entry would otherwise write the stock twice and the waste report double.
  const lines: StopLine[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(input.lines) ? input.lines.slice(0, 200) : []) {
    const slot = slots.get(String(raw.selection));
    if (!slot || seen.has(slot.selection)) continue;
    seen.add(slot.selection);
    const filled = whole(raw.filled, slot.capacity) ?? 0;
    const perReason = new Map<RemovalReason, number>();
    for (const r of Array.isArray(raw.removed) ? raw.removed.slice(0, 8) : []) {
      const reason = r.reason as RemovalReason;
      const qty = whole(r.qty, slot.capacity) ?? 0;
      if (REMOVAL_REASONS.includes(reason) && qty > 0) perReason.set(reason, (perReason.get(reason) ?? 0) + qty);
    }
    let room = slot.capacity;
    const removed: StopLine["removed"] = [];
    for (const [reason, qty] of perReason) {
      const taken = Math.min(qty, room);
      if (taken > 0) removed.push({ reason, qty: taken });
      room -= taken;
    }
    const countAfter = raw.countAfter === null ? null : whole(raw.countAfter, slot.capacity);
    lines.push({
      selection: slot.selection,
      prepared: prepared[slotKey(machineId, slot.selection)] ?? 0,
      filled,
      removed,
      countAfter,
      full: raw.full === true,
    });
  }

  // One event per slot, at the level it was left at. Only what went in is a
  // refill, with a fresh batch behind it; a slot seen full or counted without
  // filling is a correction, of stock whose age nobody knows.
  const refills: { selection: string; level_after: number }[] = [];
  const corrections = new Map<string, { selection: string; level_after: number }[]>();
  for (const line of lines) {
    const slot = slots.get(line.selection)!;
    const level = levelAfter(slot, slot.stock, line);
    if (level === null) continue;
    if (line.filled > 0) {
      refills.push({ selection: line.selection, level_after: level });
    } else if (line.removed.length === 0 && line.countAfter === null && !line.full) {
      // Nothing went in, nothing came out, nobody counted: write nothing. A
      // correction at Vendly's own estimate would pass the estimate off as a count.
      continue;
    } else {
      const reason = line.countAfter !== null || line.full ? "count" : (line.removed[0]?.reason ?? "count");
      corrections.set(reason, [...(corrections.get(reason) ?? []), { selection: line.selection, level_after: level }]);
    }
  }

  await finishStop(orgId, sheetId, machineId, {
    refills,
    corrections: [...corrections].map(([note, entries]) => ({ note, entries })),
    record: {
      checkedAt:
        typeof input.checkedAt === "string" && !Number.isNaN(Date.parse(input.checkedAt))
          ? new Date(input.checkedAt).toISOString()
          : null,
      completedAt: new Date().toISOString(),
      skipped: false,
      technical: input.technical === true,
      note: typeof input.note === "string" ? input.note.slice(0, 200) : null,
      lines,
    },
  });
}

/** A stop that is not done this round: nothing is written to the machine. */
export async function skipStop(sheetId: string, machineId: string): Promise<void> {
  const { orgId, round } = await openRound(sheetId);
  if (!round.machines.some((machine) => machine.id === machineId)) throw new Error("Not found");
  if (!round.readyAt) throw new Error("Round not started");
  if (round.stops[machineId]?.completedAt) return;
  await finishStop(orgId, sheetId, machineId, {
    refills: [],
    corrections: [],
    record: {
      checkedAt: null,
      completedAt: new Date().toISOString(),
      skipped: true,
      technical: false,
      note: null,
      lines: [],
    },
  });
}

/**
 * The stock a stop writes and the note that it is done go in one database
 * transaction, under a lock on the round. If anything fails nothing is
 * written, so a retry starts from the same stock; a second phone on the same
 * stop, or a skip racing a fill, finds the stop already done and writes nothing.
 */
async function finishStop(
  orgId: string,
  sheetId: string,
  machineId: string,
  work: {
    refills: { selection: string; level_after: number }[];
    corrections: { note: string; entries: { selection: string; level_after: number }[] }[];
    record: StopRecord;
  },
) {
  const { data, error } = await createAdminClient().rpc("refill_finish_stop", {
    target_org: orgId,
    sheet: sheetId,
    machine: machineId,
    refills: work.refills,
    corrections: work.corrections,
    filler_name: await fillerName(),
    record: work.record,
  });
  if (error) throw new Error(error.message);
  if (data === "closed") throw new Error("Round is closed");
  if (data === "not_started") throw new Error("Round not started");
  revalidatePath(`/refill/${sheetId}`);
}

/**
 * "Afronden": where everything that came back went. The quantities are worked
 * out here again from the round; only the destinations come from the phone.
 */
export async function completeRound(
  sheetId: string,
  choices: { productId: string; source: "leftover" | "removed"; reason: string | null; disposition: string }[],
  km: number | null = null,
): Promise<void> {
  const { orgId, round } = await openRound(sheetId);
  // Closing is the last step: after the start, with every machine done or skipped.
  if (!round.readyAt || round.machines.some((machine) => !round.stops[machine.id]?.completedAt)) {
    throw new Error("Round not finished");
  }
  const rows = returnsFor(round.lines, round.slots, round.picked, round.stops).map((row) => {
    const choice = choices.find(
      (c) => c.productId === row.productId && c.source === row.source && (c.reason ?? null) === (row.reason ?? null),
    );
    const disposition = DISPOSITIONS.includes(choice?.disposition as Disposition)
      ? (choice!.disposition as Disposition)
      : row.disposition;
    return { ...row, disposition };
  });

  // Waste reports read the expired count from the round's lines. Something past
  // its date can come out of a slot the round did not fill: that slot gets a
  // line of its own with nothing to add, or the waste report would never see it.
  const expiredBySlot = new Map<string, number>();
  for (const [machineId, stop] of Object.entries(round.stops)) {
    for (const line of stop.lines) {
      const expired = line.removed.filter((r) => r.reason === "expired").reduce((sum, r) => sum + r.qty, 0);
      if (expired) expiredBySlot.set(slotKey(machineId, line.selection), expired);
    }
  }
  const admin = createAdminClient();
  const { data: sheet } = await admin
    .from("refill_sheets")
    .select("lines, filled_by")
    .eq("id", sheetId)
    .eq("org_id", orgId)
    .single();
  const planned = (sheet?.lines ?? []) as RefillLine[];
  const lines: RefillLine[] = planned.map((line) => ({
    ...line,
    qty_expired: expiredBySlot.get(slotKey(line.machine_id, line.selection_number)) ?? 0,
  }));
  const inPlan = new Set(planned.map((line) => slotKey(line.machine_id, line.selection_number)));
  const machineName = new Map(round.machines.map((machine) => [machine.id, machine.name]));
  for (const slot of round.slots) {
    const key = slotKey(slot.machineId, slot.selection);
    const expired = expiredBySlot.get(key);
    if (!expired || inPlan.has(key)) continue;
    lines.push({
      machine_id: slot.machineId,
      machine_name: machineName.get(slot.machineId) ?? "—",
      row_position: slot.row,
      slot_position: slot.slot,
      selection_number: slot.selection,
      product_id: slot.productId,
      product_name: slot.productName ?? "—",
      photo_path: null,
      stock: slot.stock ?? 0,
      capacity: slot.capacity,
      to_add: 0,
      shelf_life_days: null,
      next_expires_at: null,
      qty_expired: expired,
    });
  }

  await admin
    .from("refill_sheets")
    .update({
      returns: rows,
      lines,
      completed_at: new Date().toISOString(),
      // Kilometres are optional; a number that is no distance is left out, not refused.
      ...(typeof km === "number" && km > 0 && km <= 2000 ? { km: Math.round(km * 10) / 10 } : {}),
      // Whoever started the round filled it; the name was kept at the start.
      filled_by: (sheet?.filled_by as string | null) ?? (await fillerName()),
    })
    .eq("id", sheetId)
    .eq("org_id", orgId)
    .is("completed_at", null);

  const who = (sheet?.filled_by as string | null) ?? PUSH.pushSomeone;
  const minutes = round.readyAt ? Math.max(1, Math.round((Date.now() - new Date(round.readyAt).getTime()) / 60000)) : 0;
  const visited = Object.values(round.stops).filter((stop) => !stop.skipped).length;
  after(() =>
    notifyOperators(orgId, {
      title: "Vendly",
      body: fmt(PUSH.pushDone, { name: who, count: visited, minutes }),
      url: `/refill/${sheetId}`,
      tag: `round-${sheetId}`,
    }),
  );
  revalidatePath("/refill");
  revalidatePath(`/refill/${sheetId}`);
}

