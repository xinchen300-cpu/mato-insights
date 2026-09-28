"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireOrgId } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";
import { imageFrom, removeImage, uploadImage } from "@/lib/upload";

function text(formData: FormData, field: string): string | null {
  return String(formData.get(field) ?? "").trim() || null;
}

export async function saveBusiness(formData: FormData) {
  const orgId = await requireOrgId();
  const admin = createAdminClient();

  const id = String(formData.get("id") ?? "") || null;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Name is required");

  const fields = {
    name,
    started_on: text(formData, "startedOn"),
    contact_name: text(formData, "contactName"),
    email: text(formData, "email"),
    phone: text(formData, "phone"),
    notes: text(formData, "notes"),
  };

  let business: { id: string; logo_path: string | null };
  if (id) {
    const { data, error } = await admin
      .from("businesses")
      .update(fields)
      .eq("id", id)
      .eq("org_id", orgId)
      .select("id, logo_path")
      .single();
    if (error) throw new Error(error.message);
    business = data;
  } else {
    const { data, error } = await admin
      .from("businesses")
      .insert({ org_id: orgId, ...fields })
      .select("id, logo_path")
      .single();
    if (error) throw new Error(error.message);
    business = data;
  }

  const logo = imageFrom(formData, "logo");
  const removeLogo = formData.get("removeLogo") === "1";
  if (logo || removeLogo) {
    const logoPath = logo ? await uploadImage(orgId, "businesses", business.id, logo) : null;
    await admin.from("businesses").update({ logo_path: logoPath }).eq("id", business.id);
    await removeImage(business.logo_path);
  }

  revalidatePath("/", "layout");
  return business.id;
}

/**
 * Turn the business' read-only page on (a fresh token, which also kills any
 * earlier link) or off.
 */
export async function setBusinessShare(id: string, enabled: boolean): Promise<string | null> {
  const orgId = await requireOrgId();
  const token = enabled ? randomBytes(18).toString("base64url") : null;
  const { error } = await createAdminClient()
    .from("businesses")
    .update({ share_token: token })
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
  return token;
}

/** Per-terminal override of the business start date, for a second-hand machine. */
export async function setMachineDataSince(machineId: string, value: string | null) {
  const orgId = await requireOrgId();
  const { error } = await createAdminClient()
    .from("machines")
    .update({ data_since: value || null })
    .eq("id", machineId)
    .eq("org_id", orgId);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function deleteBusiness(id: string) {
  if (!UUID.test(id)) throw new Error("Invalid business");
  const orgId = await requireOrgId();
  const admin = createAdminClient();

  const { count } = await admin
    .from("machines")
    .select("id", { count: "exact", head: true })
    .or(`business_id.eq.${id},shared_business_id.eq.${id}`)
    .eq("excluded", false);
  if (count) throw new Error("Business still has machines");

  const { data } = await admin
    .from("businesses")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId)
    .select("logo_path")
    .maybeSingle();
  await removeImage(data?.logo_path);
  revalidatePath("/", "layout");
}
