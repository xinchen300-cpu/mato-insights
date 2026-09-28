"use server";

import { revalidatePath } from "next/cache";
import { requireOrgId } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";
import { MACHINE_TYPES, SLOT_SIZES, type LayoutRowSpec, type MachineType, type SlotSize } from "@/lib/types";

export async function assignProduct(machineId: string, selection: string, productId: string | null) {
  const orgId = await requireOrgId();
  const { error } = await createAdminClient().rpc("assign_product", {
    target_org: orgId,
    target_machine: machineId,
    selection,
    product: productId,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

export async function updateMachineDetails(
  machineId: string,
  input: {
    name: string;
    type: MachineType | null;
    businessId: string | null;
    newBusinessName?: string;
    /** The second business of a shared machine; null for a machine of one business. */
    sharedBusinessId: string | null;
    dataSince: string | null;
  },
) {
  const orgId = await requireOrgId();
  const admin = createAdminClient();

  const name = input.name.trim();
  if (!name) throw new Error("Name is required");
  if (input.type && !MACHINE_TYPES.includes(input.type)) throw new Error("Invalid type");

  let businessId = input.businessId;
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
  if (input.sharedBusinessId && !sharedBusinessId) throw new Error("A shared machine needs two different businesses");

  const { error } = await admin
    .from("machines")
    .update({
      name,
      type: input.type,
      business_id: businessId,
      shared_business_id: sharedBusinessId,
      data_since: input.dataSince,
    })
    .eq("id", machineId)
    .eq("org_id", orgId);
  if (error) throw new Error(error.message);

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
    machine_type: type,
    layout: clean.map((slots) => ({ slots })),
  });
  if (error) throw new Error(error.message);

  // Product links are kept per selection number, so only changed ones are written.
  for (const [selection, productId] of Object.entries(assignments)) {
    if (!seen.has(selection)) continue;
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
  const clean = entries
    .filter((e) => /^[0-9]+$/.test(e.selection) && Number.isInteger(e.level_after) && e.level_after >= 0)
    .map((e) => ({
      selection: e.selection,
      level_after: e.level_after,
      expires_on: e.expires_on && /^\d{4}-\d{2}-\d{2}$/.test(e.expires_on) ? e.expires_on : null,
    }));
  if (clean.length === 0) return;

  const { error } = await createAdminClient().rpc("record_stock", {
    target_org: orgId,
    target_machine: machineId,
    event_type: type,
    entries: clean,
    filler_name: filler.trim().slice(0, 80),
    check_state: Object.fromEntries(Object.entries(checks).filter(([, v]) => v === true)),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}
