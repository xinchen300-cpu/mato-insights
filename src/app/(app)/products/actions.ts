"use server";

import { revalidatePath } from "next/cache";
import { PRODUCT_COLUMNS, requireMachineAccess, requireProductAccess } from "@/lib/data";
import { CUSTOM_SHELF_LIFE } from "@/lib/expiry";
import { denyFillerAccess, getScope, requireBusinessAccess, requireOrgId } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Product } from "@/lib/types";
import { imageFrom, removeImage, uploadImage } from "@/lib/upload";

function parsePrice(raw: FormDataEntryValue | null): number | null {
  const text = String(raw ?? "").replace(",", ".").trim();
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : null;
}

export async function saveProduct(formData: FormData): Promise<Product> {
  const orgId = await requireOrgId();
  await denyFillerAccess();
  const admin = createAdminClient();

  const id = String(formData.get("id") ?? "") || null;
  // The id and the business come out of a form, so they come from the client:
  // neither may reach for another customer's product.
  if (id) await requireProductAccess(orgId, id);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Name is required");
  const price = parsePrice(formData.get("price"));
  // A shop's products are always its own: it can neither hand one to the whole
  // organisation (an empty choice) nor to another shop.
  const { businessId: own } = await getScope();
  const business_id = own ?? (String(formData.get("businessId") ?? "") || null);
  if (business_id) await requireBusinessAccess(business_id);
  // Producers are no longer chosen on screen: a form without the field leaves
  // a product's producer as it was instead of wiping it.
  const producer = formData.has("producerId") ? { producer_id: String(formData.get("producerId") ?? "") || null } : {};
  const shelfRaw = Number(String(formData.get("shelfLifeDays") ?? "").trim());
  const preset = String(formData.get("shelfLifePresetId") ?? "");
  // A category or an own number, never both: the number only counts as an override.
  const shelf_life_preset_id = preset && preset !== CUSTOM_SHELF_LIFE ? preset : null;
  const shelf_life_days =
    preset === CUSTOM_SHELF_LIFE && Number.isInteger(shelfRaw) && shelfRaw > 0 ? shelfRaw : null;

  let product: Product;
  if (id) {
    const { data, error } = await admin
      .from("products")
      .update({ name, price, business_id, ...producer, shelf_life_days, shelf_life_preset_id })
      .eq("id", id)
      .eq("org_id", orgId)
      .select(PRODUCT_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    product = data;
  } else {
    const { data, error } = await admin
      .from("products")
      .insert({ org_id: orgId, name, price, business_id, ...producer, shelf_life_days, shelf_life_preset_id })
      .select(PRODUCT_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    product = data;
  }

  const photo = imageFrom(formData, "photo");
  const removePhoto = formData.get("removePhoto") === "1";
  if (photo || removePhoto) {
    const photoPath = photo ? await uploadImage(orgId, "products", product.id, photo) : null;
    await admin.from("products").update({ photo_path: photoPath }).eq("id", product.id);
    await removeImage(product.photo_path);
    product = { ...product, photo_path: photoPath };
  }

  revalidatePath("/", "layout");
  return { ...product, price: product.price === null ? null : Number(product.price) };
}

// Quick create from a picker: just a name, optionally a price. Made from a
// machine, it belongs to that machine's business until someone changes it.
export async function createProduct(
  name: string,
  price: number | null = null,
  machineId: string | null = null,
): Promise<Product> {
  const orgId = await requireOrgId();
  await denyFillerAccess();
  // The machine decides whose product this is, so it must be the caller's own.
  if (machineId) await requireMachineAccess(orgId, machineId);
  const admin = createAdminClient();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required");

  const { data: machine } = machineId
    ? await admin.from("machines").select("business_id").eq("id", machineId).eq("org_id", orgId).maybeSingle()
    : { data: null };

  // Whose product: a shop's own always; otherwise the machine's business.
  const { businessId: own } = await getScope();
  const { data, error } = await admin
    .from("products")
    .insert({ org_id: orgId, name: trimmed, price, business_id: own ?? machine?.business_id ?? null })
    .select(PRODUCT_COLUMNS)
    .single();
  if (error) throw new Error(error.message);

  revalidatePath("/products");
  return { ...data, price: data.price === null ? null : Number(data.price) };
}

export async function setProductArchived(id: string, archived: boolean) {
  const orgId = await requireOrgId();
  await requireProductAccess(orgId, id);
  await createAdminClient().from("products").update({ archived }).eq("id", id).eq("org_id", orgId);
  revalidatePath("/products");
}
