"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionUser, isFiller, isOperator, requireOperator, requireOrgId, requireRefillAccess } from "@/lib/org";
import { getDishes, getMachineStock, getMachines, getRefillPlan, requireRefillLayoutAccess, type Dish } from "@/lib/data";
import { displayName } from "@/lib/people";
import { featureAllowed } from "@/lib/billing";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SlotSize } from "@/lib/types";
import { cleanRoundSettings, legKey, mergeRoute, orderByRoute, type RoundSettings } from "@/lib/round-settings";

export async function createRefillSheet(
  machineIds: string[],
  /** The operator fills it themselves, as a filler does (Xin, 20-10-2026): straight into the round. */
  options: { fill?: boolean } = {},
): Promise<{ empty: true } | { locked: true } | void> {
  // A run carries every slot of every machine on it, including a co-tenant's
  // on a shared machine: planning one is the operator's or a filler's job,
  // never a shop's.
  const orgId = await requireRefillAccess();
  // Refill runs start at Zaak; a Solo account sees the note, not an error.
  if (!(await featureAllowed(orgId, "refill"))) return { locked: true };
  if (machineIds.length === 0) return { empty: true };
  // The list comes from a checkbox on a page, so it comes from the client:
  // asking for a machine that is not yours must not put it on your sheet.
  const machines = await getMachines(orgId);
  const own = new Set(machines.map((machine) => machine.id));
  if (machineIds.some((machineId) => !own.has(machineId))) throw new Error("Not found");
  // A machine filled by hand never goes on a round, whatever a page sent (one opened before it was set so).
  const byHand = new Set(machines.filter((machine) => machine.refill_manual).map((machine) => machine.id));
  const asked = machineIds.filter((machineId) => !byHand.has(machineId));
  if (asked.length === 0) return { empty: true };
  const admin = createAdminClient();

  // The route: the owner puts the machines in order while making the round,
  // and that order is kept for the next ones. A filler's round follows it.
  const operator = await isOperator();
  const { data: org } = await admin.from("organizations").select("refill_settings").eq("id", orgId).maybeSingle();
  const settings = cleanRoundSettings(org?.refill_settings);
  const chosen = [...new Set(asked)];
  const order = operator ? chosen : orderByRoute(chosen, settings.route);

  const lines = await getRefillPlan(orgId, asked);
  if (lines.length === 0) return { empty: true };
  // A machine with nothing to fill is not visited: nobody drives to a full machine.
  const planned = new Set(lines.map((line) => line.machine_id));

  const { data: sheet, error: insertError } = await admin
    .from("refill_sheets")
    .insert({
      org_id: orgId,
      share_token: randomBytes(18).toString("base64url"),
      machine_ids: order.filter((id) => planned.has(id)),
      // All of them, in order: a full one stays on the filler's route with a word.
      chosen_machine_ids: order,
      lines,
      // Filled step by step, machine by machine (/vullen).
      flow_version: 2,
      // Whose round it is, so they find it back to carry on (20-10-2026).
      created_by: (await getSessionUser())?.id ?? null,
    })
    .select("id")
    .single();
  if (insertError) throw new Error(insertError.message);

  // Only the owner's order becomes the route, and only with their own machines on it.
  if (operator) {
    const route = mergeRoute(settings.route.filter((id) => own.has(id)), order);
    if (route.join() !== settings.route.join()) {
      const { error: routeError } = await admin
        .from("organizations")
        .update({ refill_settings: { ...settings, route } })
        .eq("id", orgId);
      if (routeError) throw new Error(routeError.message);
    }
  }

  revalidatePath("/refill");
  // A filler, or the operator filling it themselves, starts filling; otherwise the operator lands on the round to hand it out.
  redirect((await isFiller()) || options?.fill === true ? `/vullen/${sheet.id}` : `/refill/${sheet.id}`);
}

export async function saveSheetNotes(sheetId: string, notes: string) {
  const orgId = await requireOrgId();
  // The notes belong to the run, and the run is the operator's.
  await requireOperator();
  await createAdminClient()
    .from("refill_sheets")
    .update({ notes: notes.trim().slice(0, 1000) || null })
    .eq("id", sheetId)
    .eq("org_id", orgId);
  revalidatePath(`/refill/${sheetId}`);
}

/** The kilometres of a round, written or corrected by the operator: the drive in its cost. */
export async function saveRunKm(sheetId: string, km: number | null) {
  const orgId = await requireOrgId();
  await requireOperator();
  const value = km === null ? null : Math.round(km * 10) / 10;
  if (value !== null && !(value > 0 && value <= 2000)) throw new Error("Not a distance");
  const { error } = await createAdminClient()
    .from("refill_sheets")
    .update({ km: value })
    .eq("id", sheetId)
    .eq("org_id", orgId);
  if (error) throw new Error(error.message);
  revalidatePath(`/refill/${sheetId}`);
}

/**
 * A round that will not happen, gone as if it was never made: only while no
 * machine of it is done, so nothing of it reached a machine or the stock. A
 * round with a machine done is finished on the phone instead.
 */
export async function cancelRound(sheetId: string): Promise<"cancelled" | "started"> {
  const orgId = await requireOrgId();
  await requireOperator();
  const admin = createAdminClient();
  const { data: sheet, error } = await admin
    .from("refill_sheets")
    .select("id, stops, completed_at")
    .eq("id", sheetId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!sheet || sheet.completed_at) throw new Error("Not found");
  const stops = (sheet.stops ?? {}) as Record<string, { completedAt?: string | null } | null>;
  if (Object.values(stops).some((stop) => stop?.completedAt)) return "started";
  // Its shortages go with it. Should a machine finish in this very moment, its
  // stock stays written: those events only lose their link to the round.
  const { error: deleteError } = await admin
    .from("refill_sheets")
    .delete()
    .eq("id", sheetId)
    .eq("org_id", orgId)
    .is("completed_at", null);
  if (deleteError) throw new Error(deleteError.message);
  revalidatePath("/refill");
  revalidatePath("/");
  return "cancelled";
}

/**
 * "Rondes verwijderen" on Bijvullen (Xin, 19-10-2026): open rounds go, by the
 * filler as much as the operator, also once machines were done in them. What
 * went into those machines stays counted (the stock keeps, it only loses its
 * link to the round); the round itself, its plan and its timings, goes. A
 * finished round is history and stays.
 */
export async function deleteOpenRounds(sheetIds: string[]): Promise<number> {
  const orgId = await requireRefillAccess();
  const ids = [...new Set(Array.isArray(sheetIds) ? sheetIds : [])]
    .filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id))
    .slice(0, 50);
  if (ids.length === 0) return 0;
  // Their shortages go with them (on delete cascade).
  const { data, error } = await createAdminClient()
    .from("refill_sheets")
    .delete()
    .eq("org_id", orgId)
    .is("completed_at", null)
    .in("id", ids)
    .select("id");
  if (error) throw new Error(error.message);
  revalidatePath("/refill");
  revalidatePath("/");
  return data?.length ?? 0;
}

/** How rounds go for this organisation's fillers, from the Werkwijze page. */
export async function saveRoundSettings(input: RoundSettings): Promise<RoundSettings> {
  const orgId = await requireOrgId();
  await requireOperator();
  const admin = createAdminClient();
  // The route, its distances, drive times and the start address are set on the
  // Route tab and when a round is made, never here: what is stored stays.
  const { data: stored } = await admin.from("organizations").select("refill_settings").eq("id", orgId).maybeSingle();
  const kept = cleanRoundSettings(stored?.refill_settings);
  const settings = { ...cleanRoundSettings(input), route: kept.route, legs: kept.legs, drive: kept.drive, depotAddress: kept.depotAddress };
  const { error } = await admin
    .from("organizations")
    .update({ refill_settings: settings })
    .eq("id", orgId);
  if (error) throw new Error(error.message);
  revalidatePath("/refill/workflow");
  return settings;
}


/**
 * The route from the Route tab: the order the owner wants the machines in, and
 * the kilometres of each leg shown there (null clears one). Only this
 * organisation's own machines; distances of pairs not shown are kept, so a
 * stop moved back into place finds its distance again.
 */
export async function saveRoute(route: string[], legs: Record<string, number | null>): Promise<void> {
  const orgId = await requireOrgId();
  await requireOperator();
  const own = new Set((await getMachines(orgId)).map((machine) => machine.id));
  const admin = createAdminClient();
  const { data: stored } = await admin.from("organizations").select("refill_settings").eq("id", orgId).maybeSingle();
  const settings = cleanRoundSettings(stored?.refill_settings);

  const ownLeg = (key: string) => key.split("|").every((end) => end === "depot" || own.has(end));
  const sent = Object.entries(legs).filter(([key]) => ownLeg(key));
  const cleared = new Set(sent.filter(([, km]) => km === null).map(([key]) => legKey(...(key.split("|") as [string, string]))));
  const given = cleanRoundSettings({ legs: Object.fromEntries(sent.filter(([, km]) => km !== null)) }).legs;
  const next = {
    ...settings,
    route: cleanRoundSettings({ route }).route.filter((id) => own.has(id)),
    legs: Object.fromEntries(
      Object.entries({ ...settings.legs, ...given }).filter(([key]) => ownLeg(key) && !cleared.has(key)),
    ),
  };
  const { error } = await admin.from("organizations").update({ refill_settings: next }).eq("id", orgId);
  if (error) throw new Error(error.message);
  revalidatePath("/refill/route");
  revalidatePath("/refill");
}

/**
 * What is in a machine's slots, corrected by whoever fills it with a plus or a
 * minus (Xin, 17-10-2026): the operator or a filler, never a shop. Products and
 * capacities come from the machine itself, never from the phone; a selection
 * without a product, or a count beyond what fits, is dropped. Saved as a
 * correction, so no new expiry batch is made: filling goes through a round.
 */
export async function correctStock(machineId: string, entries: { selection: string; level: number }[]) {
  const orgId = await requireRefillAccess();
  if (!/^[0-9a-f-]{36}$/i.test(machineId)) throw new Error("Not found");
  // Empty for a machine of another organisation, or one without a layout.
  const slots = new Map(
    (await getMachineStock(orgId, [machineId])).filter((slot) => slot.product_id).map((slot) => [slot.selection_number, slot]),
  );
  if (slots.size === 0) throw new Error("Not found");
  // One count per selection: the same one twice would write two corrections.
  const clean = [...new Map(entries.map((entry) => [entry.selection, entry.level])).entries()].flatMap(([selection, level]) => {
    const slot = slots.get(selection);
    return slot && Number.isInteger(level) && level >= 0 && level <= slot.capacity
      ? [{ selection, level_after: level, expires_on: null }]
      : [];
  });
  if (clean.length === 0) return;
  // Measured against the stock the person saw, which leaves out a round still under way (21-10-2026).
  const { error } = await createAdminClient().rpc("record_stock_settled", {
    target_org: orgId,
    target_machine: machineId,
    event_type: "correction",
    entries: clean,
    filler_name: (displayName(await getSessionUser()) ?? "").slice(0, 80),
    check_state: {},
  });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

/**
 * A machine's layout as whoever fills it changes it from its refill page (Xin,
 * 17-10-2026): how many slots each row has, their numbers and the product in
 * each. Sizes and capacities stay the machine's own: a slot takes those of the
 * slot that stood in its place, a new one those of its row. Everything is
 * checked before anything is written, as in the builder. Sales already made
 * keep the product they were sold as; a change counts from now on.
 */
export async function saveSlots(machineId: string, rows: string[][], products: Record<string, string | null>) {
  const orgId = await requireRefillAccess();
  const machine = await requireRefillLayoutAccess(orgId, machineId);
  const kept = rows.map((row) => row.map((selection) => String(selection).trim())).filter((row) => row.length > 0);
  const all = kept.flat();
  if (kept.length === 0 || kept.length > 20 || kept.some((row) => row.length > 16)) throw new Error("invalid layout");
  if (all.some((selection) => !/^[0-9]{1,4}$/.test(selection))) throw new Error("invalid selection");
  if (new Set(all).size !== all.length) throw new Error("duplicate selection");

  const [current, dishes] = await Promise.all([getMachineStock(orgId, [machineId]), getDishes(orgId, machineId)]);
  // A product the machine may take, or the one a slot already has.
  const allowed = new Set([...dishes.map((dish) => dish.id), ...current.flatMap((slot) => (slot.product_id ? [slot.product_id] : []))]);
  const before = new Map(current.map((slot) => [slot.selection_number, slot.product_id]));
  const links: [string, string | null][] = [];
  for (const selection of all) {
    const product = typeof products[selection] === "string" ? products[selection] : null;
    if (product && !allowed.has(product)) throw new Error("Not found");
    if (product !== (before.get(selection) ?? null)) links.push([selection, product]);
  }
  // A number that went away: its link is closed too, or the product would hang on a slot that is gone.
  for (const [selection, product] of before) if (product && !all.includes(selection)) links.push([selection, null]);

  const shape = (row: number, index: number): { size: SlotSize; depth: number } => {
    const inRow = current.filter((slot) => slot.row_position === row).sort((a, b) => a.slot_position - b.slot_position);
    const slot = inRow[index] ?? inRow.at(-1) ?? current.at(-1);
    return slot ? { size: slot.size, depth: slot.capacity } : { size: "small", depth: 5 };
  };
  const admin = createAdminClient();
  const { error } = await admin.rpc("save_machine_layout", {
    target_org: orgId,
    target_machine: machineId,
    machine_type: machine.type,
    layout: kept.map((row, r) => ({
      slots: row.map((selection, i) => ({ selection_number: selection, ...shape(r, i), business_id: null })),
    })),
  });
  if (error) throw new Error(error.message);
  for (const [selection, product] of links) {
    const { error: linkError } = await admin.rpc("assign_product", {
      target_org: orgId,
      target_machine: machineId,
      selection,
      product,
    });
    if (linkError) throw new Error(linkError.message);
  }
  revalidatePath("/", "layout");
}

/**
 * A new product typed in while laying out a machine from its refill page:
 * a name only, no price, owned the way the machine decides. A name the
 * machine can already take gives that product instead of a second one.
 */
export async function createDish(machineId: string, name: string): Promise<Dish> {
  const orgId = await requireRefillAccess();
  const machine = await requireRefillLayoutAccess(orgId, machineId);
  const trimmed = String(name).trim().slice(0, 80);
  if (!trimmed) throw new Error("Name is required");
  const known = (await getDishes(orgId, machineId)).find((dish) => dish.name.toLowerCase() === trimmed.toLowerCase());
  if (known) return known;
  const { data, error } = await createAdminClient()
    .from("products")
    .insert({ org_id: orgId, name: trimmed, price: null, business_id: machine.business_id })
    .select("id, name, photo_path")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/products");
  return { id: data.id as string, name: data.name as string, photoPath: (data.photo_path as string | null) ?? null };
}

/**
 * The order of the machines, set by dragging them on the machines page (Xin,
 * 17-10-2026), by the operator or a filler, never a shop. It is the route: the
 * machines page, the filler's tiles and new rounds all follow it. Only the
 * order changes; the kilometres between stops stay as the operator set them.
 */
export async function saveMachineOrder(order: string[]) {
  const orgId = await requireRefillAccess();
  const own = new Set((await getMachines(orgId)).map((machine) => machine.id));
  const admin = createAdminClient();
  const { data: stored, error: readError } = await admin.from("organizations").select("refill_settings").eq("id", orgId).maybeSingle();
  if (readError) throw new Error(readError.message);
  const settings = cleanRoundSettings(stored?.refill_settings);
  const route = cleanRoundSettings({ route: order }).route.filter((id) => own.has(id));
  const { error } = await admin.from("organizations").update({ refill_settings: { ...settings, route } }).eq("id", orgId);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}
