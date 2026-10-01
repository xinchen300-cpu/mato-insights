"use server";

import { revalidatePath } from "next/cache";
import { requireProductAccess } from "@/lib/data";
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
