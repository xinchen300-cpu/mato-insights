"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { denyFillerAccess, getCurrentBusinessId, getCurrentOrgId, requireOperator } from "@/lib/org";
import { triggerPayterSync } from "@/lib/sync";

async function requireOrgId() {
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("No organization found");
  return orgId;
}

/**
 * Everything on this page belongs to whoever runs the fleet: the Payter
 * login, the run cost, the shelf-life categories, the layout templates. A
 * shop account has no business writing any of it.
 */
async function requireOrgOwner() {
  const orgId = await requireOrgId();
  await requireOperator();
  return orgId;
}

export async function connectPayter(formData: FormData) {
  const orgId = await requireOrgOwner();

  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const domain = String(formData.get("domain") ?? "").trim();
  if (!username || !password || !domain) throw new Error("Username, password and domain are required");

  const { error } = await createAdminClient().rpc("set_payter_credentials", {
    target_org: orgId,
    p_username: username,
    p_password: password,
    p_domain: domain,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/settings");
}

export async function syncNow() {
  const orgId = await requireOrgOwner();
  const result = await triggerPayterSync(orgId);
  revalidatePath("/", "layout");
  return result;
}

export async function deleteTemplate(templateId: string) {
  const orgId = await requireOrgOwner();
  // Built-in templates have no org and can't be deleted.
  await createAdminClient().from("layout_templates").delete().eq("id", templateId).eq("org_id", orgId);
  revalidatePath("/settings");
}

export async function saveShelfLifePreset(formData: FormData) {
  const orgId = await requireOrgOwner();
  const id = String(formData.get("id") ?? "") || null;
  const name = String(formData.get("name") ?? "").trim();
  const days = Number(String(formData.get("days") ?? "").trim());
  if (!name || !Number.isInteger(days) || days <= 0) throw new Error("A name and a number of days are required");

  const admin = createAdminClient();
  const { error } = id
    ? await admin.from("shelf_life_presets").update({ name, days }).eq("id", id).eq("org_id", orgId)
    : await admin.from("shelf_life_presets").insert({ org_id: orgId, name, days });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

/** Products in this category fall back to no shelf life until they get another. */
export async function deleteShelfLifePreset(id: string) {
  const orgId = await requireOrgOwner();
  const { error } = await createAdminClient()
    .from("shelf_life_presets")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

/** Hourly rate and price per kilometre, used to price a run. */
export async function saveRunCost(perHour: number, perKm: number): Promise<boolean> {
  const orgId = await requireOrgOwner();
  const clean = (n: number, max: number) => (Number.isFinite(n) && n >= 0 && n <= max ? n : null);
  const hour = clean(perHour, 500);
  const km = clean(perKm, 20);
  // Refusing quietly while the screen says "saved" is worse than refusing out loud.
  if (hour === null || km === null) return false;

  await createAdminClient()
    .from("organizations")
    .update({ cost_per_hour: hour, cost_per_km: km })
    .eq("id", orgId);
  revalidatePath("/", "layout");
  return true;
}

/** Remember this browser as somewhere Vendly may send a notification. */
export async function rememberDevice(sub: { endpoint: string; p256dh: string; auth: string; label: string }) {
  const orgId = await requireOrgId();
  // The evening digest is the operator's or a shop's; a filler gets none.
  await denyFillerAccess();
  const businessId = await getCurrentBusinessId();
  if (!sub.endpoint || !sub.p256dh || !sub.auth) return;

  await createAdminClient()
    .from("push_subscriptions")
    .upsert(
      {
        endpoint: sub.endpoint,
        org_id: orgId,
        business_id: businessId,
        p256dh: sub.p256dh,
        auth: sub.auth,
        label: sub.label,
        failures: 0,
      },
      { onConflict: "endpoint" },
    );
}

export async function forgetDevice(endpoint: string) {
  const orgId = await requireOrgId();
  await denyFillerAccess();
  await createAdminClient().from("push_subscriptions").delete().eq("endpoint", endpoint).eq("org_id", orgId);
}
