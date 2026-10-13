"use server";

import { revalidatePath } from "next/cache";
import { uncovered, type AssignmentSpan } from "@/lib/assignments";
import { requireProductAccess, requireSelectionAccess } from "@/lib/data";
import { requireOrgId } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Bring the price here in line with what the machine actually charges. Only
 * useful when every sale of that slot came in at the same amount; the caller
 * works that out, this just writes it.
 */
export async function setProductPrice(productId: string, price: number) {
  const orgId = await requireOrgId();
  await requireProductAccess(orgId, productId);
  if (!Number.isFinite(price) || price <= 0 || price > 1000) throw new Error("Not a price");

  const { error } = await createAdminClient()
    .from("products")
    .update({ price: Math.round(price * 100) / 100 })
    .eq("id", productId)
    .eq("org_id", orgId);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

/**
 * Link a selection's unlinked sales to a product. Only the stretches of time
 * no product covers are filled, and only those with a sale in them: a slot
 * that has had its product since a rearrangement keeps it, and linking its
 * older sales writes the past, never the present. A selection never linked
 * gets the product for all of its sales, as before.
 */
export async function linkUnassigned(machineId: string, selection: string, productId: string) {
  const orgId = await requireOrgId();
  if (!/^[0-9]+$/.test(selection)) throw new Error("Not found");
  await requireSelectionAccess(orgId, machineId, selection);
  await requireProductAccess(orgId, productId);
  const admin = createAdminClient();

  const { data: spans, error } = await admin
    .from("selection_assignments")
    .select("valid_from, valid_to")
    .eq("org_id", orgId)
    .eq("machine_id", machineId)
    .eq("selection_number", selection);
  if (error) throw new Error(error.message);

  if (!spans?.length) {
    const { error: assignError } = await admin.rpc("assign_product", {
      target_org: orgId,
      target_machine: machineId,
      selection,
      product: productId,
    });
    if (assignError) throw new Error(assignError.message);
  } else {
    for (const gap of uncovered(spans as AssignmentSpan[])) {
      let sold = admin
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("machine_id", machineId)
        .eq("item_ref", selection)
        .eq("disposition", "APPROVED")
        .gt("amount", 0);
      if (gap.from !== "-infinity") sold = sold.gte("occurred_at", gap.from);
      if (gap.to !== null) sold = sold.lt("occurred_at", gap.to);
      const { count } = await sold;
      if (!count) continue;
      const { error: insertError } = await admin.from("selection_assignments").insert({
        org_id: orgId,
        machine_id: machineId,
        selection_number: selection,
        product_id: productId,
        valid_from: gap.from,
        valid_to: gap.to,
      });
      if (insertError) throw new Error(insertError.message);
    }
  }
  revalidatePath("/", "layout");
}
