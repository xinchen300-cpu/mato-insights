"use server";

import { revalidatePath } from "next/cache";
import { cleanAddress } from "@/lib/round-settings";
import { isOperator, requireOperator, requireOrgId } from "@/lib/org";
import {
  getMachine,
  requireLayoutAccess,
  requireMachineAccess,
  requireProductAccess,
  requireSelectionAccess,
} from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { displayName } from "@/lib/people";
import { asMachineModel } from "@/lib/machine-models";
import { MACHINE_TYPES, SLOT_SIZES, type LayoutRowSpec, type MachineType, type Product, type SlotSize } from "@/lib/types";
import { camerasEnabled, listCameras, type UnifiCamera } from "@/lib/unifi";
import { imageFrom, removeImage, uploadImage } from "@/lib/upload";
import { createProduct } from "../products/actions";

export async function assignProduct(machineId: string, selection: string, productId: string | null) {
  const orgId = await requireOrgId();
  await requireSelectionAccess(orgId, machineId, selection);
  if (productId) await requireProductAccess(orgId, productId);
  const { error } = await createAdminClient().rpc("assign_product", {
    target_org: orgId,
    target_machine: machineId,
    selection,
    product: productId,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

/** A new product made from a slot of this machine, owned the way the machine decides. */
export async function createProductForMachine(machineId: string, name: string): Promise<Product> {
  const orgId = await requireOrgId();
  await requireMachineAccess(orgId, machineId);
  return createProduct(name, null, machineId);
}

export async function updateMachineDetails(
  machineId: string,
  input: {
    name: string;
    type: MachineType | null;
    /** Left out by a zaak, which has no businesses: then what is stored stays. */
    businessId?: string | null;
    newBusinessName?: string;
    /** The second business of a shared machine; null for a machine of one business. */
    sharedBusinessId?: string | null;
    dataSince: string | null;
  kmRoundTrip: number | null;
    /** Filled by hand, outside Vendly; left out by a form from before the switch, and then kept. */
    refillManual?: boolean;
    /** Where it stands, for navigating there; left out by a form from before the field, and then kept. */
    address?: string;
    /** Which MATO model (src/lib/machine-models.ts); left out where the form does not ask it, and then kept. */
    model?: string | null;
  },
) {
  const orgId = await requireOrgId();
  await requireMachineAccess(orgId, machineId);
  const admin = createAdminClient();

  const name = input.name.trim().slice(0, 80);
  if (!name) throw new Error("Name is required");
  if (input.type && !MACHINE_TYPES.includes(input.type)) throw new Error("Invalid type");
  if (input.model && !asMachineModel(input.model)) throw new Error("Invalid model");

  // A shop may rename its own machine and nothing else. Who it belongs to, its
  // kind, the day its figures start and the drive there are the operator's,
  // and so is the name of a fridge two businesses share: the co-tenant sees it
  // too. Whatever else the form sends is ignored, not trusted.
  if (!(await isOperator())) {
    const current = await getMachine(orgId, machineId);
    if (!current || current.shared_business_id) throw new Error("Not found");
    const { error } = await admin.from("machines").update({ name }).eq("id", machineId).eq("org_id", orgId);
    if (error) throw new Error(error.message);
    revalidatePath("/", "layout");
    return;
  }
  // Who it is for is only changed when the form says so: a zaak never sends it.
  const assigns = input.businessId !== undefined || input.sharedBusinessId !== undefined || Boolean(input.newBusinessName?.trim());
  // The businesses named must be this organisation's own.
  const named = [input.businessId, input.sharedBusinessId].filter((id): id is string => Boolean(id));
  if (named.length) {
    const { count, error } = await admin
      .from("businesses")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .in("id", named);
    if (error) throw new Error(error.message);
    if ((count ?? 0) !== new Set(named).size) throw new Error("Not found");
  }
  let businessId = input.businessId ?? null;
  if (input.newBusinessName?.trim()) {
    const { data, error } = await admin
      .from("businesses")
      .insert({ org_id: orgId, name: input.newBusinessName.trim() })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    businessId = data.id;
  }

  const sharedBusinessId = input.sharedBusinessId && input.sharedBusinessId !== businessId ? input.sharedBusinessId : null;
  if (input.sharedBusinessId && (!sharedBusinessId || !businessId)) throw new Error("A shared machine needs two different businesses");

  const { error } = await admin
    .from("machines")
    .update({
      name,
      type: input.type,
      ...(assigns ? { business_id: businessId, shared_business_id: sharedBusinessId } : {}),
      data_since: input.dataSince,
      km_round_trip: input.kmRoundTrip,
      ...(input.refillManual !== undefined ? { refill_manual: input.refillManual === true } : {}),
      ...(input.address !== undefined ? { address: cleanAddress(input.address) } : {}),
      ...(input.model !== undefined ? { model: asMachineModel(input.model) } : {}),
    })
    .eq("id", machineId)
    .eq("org_id", orgId);
  if (error) throw new Error(error.message);

  revalidatePath("/", "layout");
}

/** The cameras on the operator's UniFi, to pick the one aimed at a machine. */
export async function listMachineCameras(): Promise<UnifiCamera[]> {
  const orgId = await requireOrgId();
  await requireOperator();
  if (!camerasEnabled(orgId)) throw new Error("Not found");
  return listCameras();
}

/**
 * The cameras aimed at this machine, in this order, or none (21-10-2026: a
 * machine can have several). Each must really be on this UniFi, never a
 * made-up id; one already linked that UniFi no longer lists may stay.
 */
export async function setMachineCameras(machineId: string, picks: { consoleId: string; cameraId: string }[]) {
  const orgId = await requireOrgId();
  await requireOperator();
  await requireMachineAccess(orgId, machineId);
  if (!camerasEnabled(orgId)) throw new Error("Not found");
  const admin = createAdminClient();
  const [available, current] = await Promise.all([
    picks.length ? listCameras() : Promise.resolve([]),
    admin.from("machine_cameras").select("console_id, camera_id, name, full_hd").eq("machine_id", machineId),
  ]);
  if (current.error) throw new Error(current.error.message);
  const unique = [...new Map(picks.map((pick) => [pick.cameraId, pick])).values()].slice(0, 8);
  const rows = unique.map((pick, position) => {
    const found = available.find((c) => c.consoleId === pick.consoleId && c.id === pick.cameraId);
    const kept = (current.data ?? []).find((c) => c.console_id === pick.consoleId && c.camera_id === pick.cameraId);
    if (!found && !kept) throw new Error("Not found");
    // Full HD from what UniFi says the camera can do; a camera that already refused one stays refused.
    const keptFullHd = (kept?.full_hd as boolean | null | undefined) ?? null;
    const fullHd = keptFullHd === false ? false : (found?.fullHd ?? keptFullHd);
    return {
      machine_id: machineId,
      console_id: pick.consoleId,
      camera_id: pick.cameraId,
      name: found?.name ?? (kept?.name as string | null) ?? null,
      position,
      full_hd: fullHd,
    };
  });
  const { error: clearError } = await admin.from("machine_cameras").delete().eq("machine_id", machineId);
  if (clearError) throw new Error(clearError.message);
  if (rows.length) {
    const { error } = await admin.from("machine_cameras").insert(rows);
    if (error) throw new Error(error.message);
  }
  // The first camera also in the columns of the first version, so they never point at a camera taken away.
  const { error } = await admin
    .from("machines")
    .update({ unifi_console_id: rows[0]?.console_id ?? null, unifi_camera_id: rows[0]?.camera_id ?? null })
    .eq("id", machineId)
    .eq("org_id", orgId);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

/** The photo on the machine's tile: a new one, or none to go back to the placeholder. */
export async function updateMachinePhoto(machineId: string, formData: FormData) {
  const orgId = await requireOrgId();
  await requireMachineAccess(orgId, machineId);
  // A fridge two businesses share shows both the same photo: the operator's to choose.
  if (!(await isOperator()) && (await getMachine(orgId, machineId))?.shared_business_id) throw new Error("Not found");
  const admin = createAdminClient();
  const { data: current, error: readError } = await admin
    .from("machines")
    .select("photo_path")
    .eq("id", machineId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!current) throw new Error("Not found");

  const photo = imageFrom(formData, "photo");
  if (!photo && formData.get("removePhoto") !== "1") return;
  const photoPath = photo ? await uploadImage(orgId, "machines", machineId, photo) : null;
  const { error } = await admin.from("machines").update({ photo_path: photoPath }).eq("id", machineId).eq("org_id", orgId);
  if (error) {
    await removeImage(photoPath);
    throw new Error(error.message);
  }
  await removeImage(current.photo_path);
  revalidatePath("/", "layout");
}

export type LayoutSlotInput = {
  selection_number: string;
  size: SlotSize;
  depth: number;
  /** Only on a shared machine: which of its two businesses rents the slot. */
  business_id?: string | null;
};

export async function saveLayout(
  machineId: string,
  type: MachineType,
  rows: LayoutSlotInput[][],
  assignments: Record<string, string | null>,
) {
  const orgId = await requireOrgId();
  // A save rewrites every slot and who rents it, so on a shared machine only
  // the operator may make one. Everything is checked before anything is
  // written: a refusal halfway would leave the new layout with the old links.
  await requireLayoutAccess(orgId, machineId);
  await requireSelectionAccess(orgId, machineId, Object.keys(assignments));
  // A shop may lay out its own machine, but its kind is the operator's call.
  const kind = (await isOperator()) ? type : ((await getMachine(orgId, machineId))?.type ?? type);
  for (const productId of new Set(Object.values(assignments))) {
    if (productId) await requireProductAccess(orgId, productId);
  }

  const seen = new Set<string>();
  for (const row of rows) {
    for (const slot of row) {
      if (!/^[0-9]+$/.test(slot.selection_number)) throw new Error("invalid selection");
      if (seen.has(slot.selection_number)) throw new Error("duplicate selection");
      if (!SLOT_SIZES.includes(slot.size) || slot.depth < 1 || slot.depth > 99) throw new Error("invalid slot");
      seen.add(slot.selection_number);
    }
  }

  const admin = createAdminClient();

  // A slot can only belong to one of the machine's own businesses.
  const { data: machine } = await admin
    .from("machines")
    .select("business_id, shared_business_id")
    .eq("id", machineId)
    .eq("org_id", orgId)
    .maybeSingle();
  const allowed = new Set(machine?.shared_business_id ? [machine.business_id, machine.shared_business_id] : []);
  const clean = rows.map((slots) =>
    slots.map((slot) => ({ ...slot, business_id: slot.business_id && allowed.has(slot.business_id) ? slot.business_id : null })),
  );

  const { error } = await admin.rpc("save_machine_layout", {
    target_org: orgId,
    target_machine: machineId,
    machine_type: kind,
    layout: clean.map((slots) => ({ slots })),
  });
  if (error) throw new Error(error.message);

  // Product links are kept per selection number, so only changed ones are written.
  // A number renumbered away arrives as null: its old link is closed as well,
  // or the product would stay attached to a slot that no longer exists.
  for (const [selection, productId] of Object.entries(assignments)) {
    if (!seen.has(selection) && (productId !== null || !/^[0-9]+$/.test(selection))) continue;
    const { error: assignError } = await admin.rpc("assign_product", {
      target_org: orgId,
      target_machine: machineId,
      selection,
      product: productId,
    });
    if (assignError) throw new Error(assignError.message);
  }

  revalidatePath("/", "layout");
}

export async function saveLayoutTemplate(name: string, type: MachineType, rows: LayoutRowSpec[]) {
  const orgId = await requireOrgId();
  // A template is the whole organisation's, so it is the operator's to add.
  await requireOperator();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required");

  const { error } = await createAdminClient()
    .from("layout_templates")
    .insert({ org_id: orgId, name: trimmed, machine_type: type, layout: rows });
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function recordStock(
  machineId: string,
  type: "refill" | "correction",
  entries: { selection: string; level_after: number; expires_on?: string | null }[],
  filler = "",
  checks: Record<string, boolean> = {},
) {
  const orgId = await requireOrgId();
  // On a shared machine a shop counts its own slots, never its neighbour's.
  await requireSelectionAccess(orgId, machineId, entries.map((e) => e.selection));
  const clean = entries
    .filter((e) => /^[0-9]+$/.test(e.selection) && Number.isInteger(e.level_after) && e.level_after >= 0)
    .map((e) => ({
      selection: e.selection,
      level_after: e.level_after,
      expires_on: e.expires_on && /^\d{4}-\d{2}-\d{2}$/.test(e.expires_on) ? e.expires_on : null,
    }));
  if (clean.length === 0) return;

  // Every account is one person, so the name comes from the account itself;
  // nobody types it at the machine any more (Xin, 14-10-2026).
  const who =
    filler.trim() ||
    displayName((await (await createClient()).auth.getUser()).data.user) ||
    "";

  // Outside a round: measured against the stock the person saw, which leaves out a round still under way (21-10-2026).
  const { error } = await createAdminClient().rpc("record_stock_settled", {
    target_org: orgId,
    target_machine: machineId,
    event_type: type,
    entries: clean,
    filler_name: who.slice(0, 80),
    check_state: Object.fromEntries(Object.entries(checks).filter(([, v]) => v === true)),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}
