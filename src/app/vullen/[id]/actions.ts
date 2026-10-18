"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getRefillRound, getSlotAges, type RefillRound } from "@/lib/data";
import { getSessionUser, requireRefillAccess } from "@/lib/org";
import {
  REMOVAL_REASONS,
  allocate,
  levelAfter,
  moveIns,
  pickList,
  returnsFor,
  slotKey,
  slotProducts,
  splitReturn,
  type RemovalReason,
  type StopLine,
  type StopRecord,
  vanPool,
} from "@/lib/refill-flow";
import { fmt } from "@/i18n/format";
import { messages } from "@/i18n/messages";
import { displayName } from "@/lib/people";
import { notifyOperators } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
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

/**
 * A moment on the phone, sent as how long ago it was and turned into a time
 * here, never before the round started. Null when the phone sent nothing usable.
 */
function phoneMoment(ago: unknown, notBefore: string | null, now = Date.now()): string | null {
  const ms = typeof ago === "number" ? ago : NaN;
  if (!Number.isFinite(ms) || ms < 0) return null;
  const floor = notBefore ? Date.parse(notBefore) : -Infinity;
  return new Date(Math.max(now - Math.min(ms, 24 * 3_600_000), floor)).toISOString();
}

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
  // The same answer the access check already got in this request.
  return displayName(await getSessionUser());
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

  const { data: updated, error } = await admin
    .from("refill_sheets")
    .update({ box, ready_at: now, started_at: round.startedAt ?? now, filled_by: who })
    .eq("id", sheetId)
    .eq("org_id", orgId)
    .is("ready_at", null)
    .select("id");
  // A start that did not reach the database must not pass for one: the phone
  // would run its clock on a round that is still waiting.
  if (error) throw new Error(error.message);
  // Only the call that actually started the round writes the shortages, and says so.
  if (!updated?.length) return;
  if (round.settings.notify.start) {
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
  }

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
  /**
   * When the filler started on this machine and when they tapped it done, as
   * milliseconds before the call: a phone whose clock runs wrong cannot move
   * them, and a phone that was locked or offline still gives the real moment.
   */
  checkedAgo: number | null;
  doneAgo: number | null;
  technical: boolean;
  note: string | null;
  lines: { selection: string; filled: number; removed: { reason: string; qty: number }[]; countAfter: number | null; full: boolean }[];
  /** The operator's own checks at this machine, by label: ticked or not. */
  checks?: Record<string, boolean>;
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
  // How old each slot's pieces are, for what is taken out to go elsewhere: read before anything is written.
  const ages = await getSlotAges(orgId, machineId);

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
      // Moved pieces take the date of the oldest in the slot along: never younger than they are.
      if (taken > 0) removed.push(reason === "moved" ? { reason, qty: taken, ...(ages.get(slot.selection) ?? { expiresOn: null, filledOn: null }) } : { reason, qty: taken });
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

  // What goes in from the van: pieces another machine on this round gave up,
  // the oldest first. They keep their date; the server's own record decides.
  const fromVan = moveIns(machineId, lines, slotProducts(round.lines, round.slots), vanPool(round.lines, round.slots, round.stops));
  for (const line of lines) {
    const moved = fromVan.get(line.selection);
    if (moved) line.movedIn = moved.qty;
  }

  // One event per slot, at the level it was left at. Only what went in is a
  // refill, with a fresh batch behind it; a slot seen full or counted without
  // filling is a correction, of stock whose age nobody knows. A filled slot
  // that also had pieces taken out writes those first, then what came from the
  // van, then the rest: written as one level, only the difference would go in
  // and the pieces taken out would be counted as still there.
  type Entry = { selection: string; level_after: number; made_on?: string; expires_on?: string };
  const pulled = new Map<string, Entry[]>();
  const fromOthers: Entry[] = [];
  const refills: Entry[] = [];
  const corrections = new Map<string, { selection: string; level_after: number }[]>();
  for (const line of lines) {
    const slot = slots.get(line.selection)!;
    const level = levelAfter(slot, slot.stock, line);
    if (level === null) continue;
    if (line.filled > 0) {
      const out = line.removed.reduce((sum, r) => sum + r.qty, 0);
      const moved = fromVan.get(line.selection);
      const dated = (date: { expiresOn: string | null; filledOn: string | null }) => ({
        ...(date.expiresOn ? { expires_on: date.expiresOn } : {}),
        ...(date.filledOn ? { made_on: date.filledOn } : {}),
      });
      if (slot.stock !== null) {
        const left = Math.max(0, slot.stock - out);
        if (out > 0) {
          const note = line.removed[0].reason;
          pulled.set(note, [...(pulled.get(note) ?? []), { selection: line.selection, level_after: left }]);
        }
        if (moved) fromOthers.push({ selection: line.selection, level_after: Math.min(level, left + moved.qty), ...dated(moved) });
        refills.push({ selection: line.selection, level_after: level });
      } else {
        // Nobody knew what was in it: one batch, dated by the oldest that went in.
        refills.push({ selection: line.selection, level_after: level, ...(moved ? dated(moved) : {}) });
      }
    } else if (line.removed.length === 0 && line.countAfter === null && !line.full) {
      // Nothing went in, nothing came out, nobody counted: write nothing. A
      // correction at Vendly's own estimate would pass the estimate off as a count.
      continue;
    } else {
      const reason = line.countAfter !== null || line.full ? "count" : (line.removed[0]?.reason ?? "count");
      corrections.set(reason, [...(corrections.get(reason) ?? []), { selection: line.selection, level_after: level }]);
    }
  }

  const now = Date.now();
  const completedAt = phoneMoment(input.doneAgo, round.readyAt, now) ?? new Date(now).toISOString();
  const checkedAt = phoneMoment(input.checkedAgo, round.readyAt, now);
  const status = await finishStop(orgId, sheetId, machineId, {
    pulled: [...pulled].map(([note, entries]) => ({ note, entries })),
    moved: fromOthers,
    refills,
    corrections: [...corrections].map(([note, entries]) => ({ note, entries })),
    record: {
      checkedAt: checkedAt && checkedAt > completedAt ? completedAt : checkedAt,
      completedAt,
      skipped: false,
      technical: input.technical === true,
      note: typeof input.note === "string" ? input.note.slice(0, 200) : null,
      lines,
      // Only the operator's own checks, as they stand now; nothing else can be
      // ticked. Since 16-10-2026 the filler's screen shows them as tips, not as
      // boxes to tick, so a stop without any ticks records no checks at all
      // instead of a row of unticked ones.
      ...(round.settings.checks.length && input.checks && Object.keys(input.checks).length > 0
        ? { checks: Object.fromEntries(round.settings.checks.map((label) => [label, input.checks?.[label] === true])) }
        : {}),
    },
  });
  // Once per machine, and only for the call that really finished it.
  if (status === "ok" && round.settings.notify.eachMachine) {
    const who = await fillerName();
    const machine = round.machines.find((mc) => mc.id === machineId)?.name ?? "";
    after(() =>
      notifyOperators(orgId, {
        title: "Vendly",
        body: fmt(PUSH.pushStopDone, { name: who ?? PUSH.pushSomeone, machine }),
        url: `/refill/${sheetId}`,
        tag: `round-${sheetId}`,
      }),
    );
  }
}

/** A stop that is not done this round: nothing is written to the machine. */
export async function skipStop(sheetId: string, machineId: string, doneAgo: number | null = null): Promise<void> {
  const { orgId, round } = await openRound(sheetId);
  if (!round.machines.some((machine) => machine.id === machineId)) throw new Error("Not found");
  if (!round.readyAt) throw new Error("Round not started");
  // The operator can ask that every machine of a round is done.
  if (!round.settings.allowSkip) throw new Error("Skipping is off");
  if (round.stops[machineId]?.completedAt) return;
  await finishStop(orgId, sheetId, machineId, {
    refills: [],
    corrections: [],
    record: {
      checkedAt: null,
      completedAt: phoneMoment(doneAgo, round.readyAt) ?? new Date().toISOString(),
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
    /** Taken out of slots that are filled again: written before them. */
    pulled?: { note: string; entries: { selection: string; level_after: number }[] }[];
    /** Pieces from another machine on the round, with their own date: written next. */
    moved?: { selection: string; level_after: number; made_on?: string; expires_on?: string }[];
    refills: { selection: string; level_after: number; made_on?: string; expires_on?: string }[];
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
    pulled: work.pulled ?? [],
    moved: work.moved ?? [],
  });
  if (error) throw new Error(error.message);
  if (data === "closed") throw new Error("Round is closed");
  if (data === "not_started") throw new Error("Round not started");
  revalidatePath(`/refill/${sheetId}`);
  return data as "ok" | "done";
}

/**
 * "Afronden": where everything that came back went. The quantities are worked
 * out here again from the round; only the destinations come from the phone.
 */
export async function completeRound(
  sheetId: string,
  /** Where each product that came back went; one product can be split over several places. */
  choices: { productId: string; source: "leftover" | "removed"; reason: string | null; disposition: string; qty?: number }[],
): Promise<void> {
  const { orgId, round } = await openRound(sheetId);
  // Closing is the last step: after the start, with every machine done or
  // skipped. A machine with nothing planned stood full and was passed by.
  const withWork = new Set(round.lines.map((line) => line.machineId));
  if (!round.readyAt || round.machines.some((machine) => withWork.has(machine.id) && !round.stops[machine.id]?.completedAt)) {
    throw new Error("Round not finished");
  }
  // The quantities come from the round; the phone only says where they went.
  const asked = Array.isArray(choices) ? choices : [];
  const rows = returnsFor(round.lines, round.slots, round.picked, round.stops).flatMap((row) =>
    splitReturn(
      row,
      asked.filter((c) => c?.productId === row.productId && c.source === row.source && (c.reason ?? null) === (row.reason ?? null)),
    ),
  );

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
  // A failed read must stop here: an empty plan written back would wipe the round's lines.
  const { data: sheet, error: readError } = await admin
    .from("refill_sheets")
    .select("lines, filled_by")
    .eq("id", sheetId)
    .eq("org_id", orgId)
    .single();
  if (readError || !sheet) throw new Error(readError?.message ?? "Not found");
  const planned = (sheet.lines ?? []) as RefillLine[];
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

  const { error: closeError } = await admin
    .from("refill_sheets")
    .update({
      returns: rows,
      lines,
      completed_at: new Date().toISOString(),
      // Whoever started the round filled it; the name was kept at the start.
      filled_by: (sheet.filled_by as string | null) ?? (await fillerName()),
    })
    .eq("id", sheetId)
    .eq("org_id", orgId)
    .is("completed_at", null);
  // The phone forgets the round once this answers, so only a real close may answer.
  if (closeError) throw new Error(closeError.message);

  const who = (sheet.filled_by as string | null) ?? PUSH.pushSomeone;
  const minutes = round.readyAt ? Math.max(1, Math.round((Date.now() - new Date(round.readyAt).getTime()) / 60000)) : 0;
  const visited = Object.values(round.stops).filter((stop) => !stop.skipped).length;
  if (round.settings.notify.finish) {
    after(() =>
      notifyOperators(orgId, {
        title: "Vendly",
        body: fmt(visited === 1 ? PUSH.pushDoneOne : PUSH.pushDone, { name: who, count: visited, minutes }),
        url: `/refill/${sheetId}`,
        tag: `round-${sheetId}`,
      }),
    );
  }
  revalidatePath("/refill");
  revalidatePath(`/refill/${sheetId}`);
}

