"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isFiller, isOperator, requireOperator, requireOrgId, requireRefillAccess } from "@/lib/org";
import { getMachines } from "@/lib/data";
import { featureAllowed } from "@/lib/billing";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RefillLine } from "@/lib/types";
import { cleanRoundSettings, legKey, mergeRoute, orderByRoute, type RoundSettings } from "@/lib/round-settings";

export async function createRefillSheet(
  machineIds: string[],
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
  const own = new Set((await getMachines(orgId)).map((machine) => machine.id));
  if (machineIds.some((machineId) => !own.has(machineId))) throw new Error("Not found");
  const admin = createAdminClient();

  // The route: the owner puts the machines in order while making the round,
  // and that order is kept for the next ones. A filler's round follows it.
  const operator = await isOperator();
  const { data: org } = await admin.from("organizations").select("refill_settings").eq("id", orgId).maybeSingle();
  const settings = cleanRoundSettings(org?.refill_settings);
  const chosen = [...new Set(machineIds)];
  const order = operator ? chosen : orderByRoute(chosen, settings.route);

  const { data, error } = await admin.rpc("refill_plan", { target_org: orgId, machine_filter: machineIds });
  if (error) throw new Error(error.message);
  const lines = (data ?? []) as RefillLine[];
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
  // The operator lands on the round to hand it out; a filler starts filling.
  redirect((await isFiller()) ? `/vullen/${sheet.id}` : `/refill/${sheet.id}`);
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

/** How rounds go for this organisation's fillers, from the Werkwijze page. */
export async function saveRoundSettings(input: RoundSettings): Promise<RoundSettings> {
  const orgId = await requireOrgId();
  await requireOperator();
  const admin = createAdminClient();
  // The route and its distances are set on the Route tab and when a round is
  // made, never here: what is stored stays.
  const { data: stored } = await admin.from("organizations").select("refill_settings").eq("id", orgId).maybeSingle();
  const kept = cleanRoundSettings(stored?.refill_settings);
  const settings = { ...cleanRoundSettings(input), route: kept.route, legs: kept.legs };
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
