"use server";

import { revalidatePath } from "next/cache";
import { featureAllowed } from "@/lib/billing";
import { checkPayterLogin, payterTerminalSerials } from "@/lib/payter-login";
import { createAdminClient } from "@/lib/supabase/admin";
import { denyFillerAccess, getCurrentBusinessId, getCurrentOrgId, getSessionUser, requireOperator, requireSignedIn } from "@/lib/org";
import { getEmailPreview, saveNotificationSettings, sendTestNotification } from "@/lib/data";
import { getI18n } from "@/i18n/server";
import type { CleanPrefs } from "@/lib/notify-prefs";

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

export type PayterConnectResult = { ok: true } | { ok: false; reason: "missing" | "rejected" | "unreachable" };

/**
 * Stores the MyPayter login only once Payter has accepted it. A refused login
 * is never saved: the sync would retry it every five minutes, and enough
 * failed logins can lock the customer's Payter account.
 */
export async function connectPayter(formData: FormData): Promise<PayterConnectResult> {
  const orgId = await requireOrgOwner();

  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const domain = String(formData.get("domain") ?? "").trim();
  if (!username || !password || !domain) return { ok: false, reason: "missing" };

  const check = await checkPayterLogin(username, password, domain);
  if (check !== "ok") return { ok: false, reason: check };

  const { error } = await createAdminClient().rpc("set_payter_credentials", {
    target_org: orgId,
    p_username: username,
    p_password: password,
    p_domain: domain,
  });
  if (error) return { ok: false, reason: "unreachable" };

  revalidatePath("/settings");
  return { ok: true };
}

export type PayterAddResult = { ok: true } | { ok: false; reason: "missing" | "rejected" | "unreachable" | "same" };

/**
 * A further MyPayter account for this business (22-10-2026, Xin: a second account with two machines of Mato
 * Vending). Checked with Payter first, as the own login is. The account the business already syncs is refused: a
 * second copy would read every sale twice. Adding the same account code again replaces its password. Its terminals
 * then appear in the picker, where the operator says which are theirs.
 */
export async function addPayterAccount(formData: FormData): Promise<PayterAddResult> {
  const orgId = await requireOrgOwner();

  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const domain = String(formData.get("domain") ?? "").trim();
  if (!username || !password || !domain) return { ok: false, reason: "missing" };

  const admin = createAdminClient();
  // Only next to the business's own login, and never that same account again. Read here, on the server only.
  const { data: own } = await admin.rpc("get_payter_credentials", { target_org: orgId });
  if (!own) return { ok: false, reason: "missing" };
  if (String((own as { domain?: unknown }).domain ?? "").toLowerCase() === domain.toLowerCase()) return { ok: false, reason: "same" };

  const check = await checkPayterLogin(username, password, domain);
  if (check !== "ok") return { ok: false, reason: check };

  const { data: loginId, error } = await admin.rpc("set_payter_extra_login", {
    target_org: orgId,
    p_username: username,
    p_password: password,
    p_domain: domain,
  });
  if (error || typeof loginId !== "string") return { ok: false, reason: "unreachable" };

  // Which terminals this account carries, now: claiming one in the picker then winds back this account, not the own.
  const serials = await payterTerminalSerials(username, password, domain);
  if (serials) await admin.from("payter_extra_logins").update({ serials }).eq("id", loginId).eq("org_id", orgId);

  revalidatePath("/settings");
  revalidatePath("/terminals");
  return { ok: true };
}

/** No more syncing from a further Payter account; its machines and the sales already in stay. */
export async function removePayterAccount(loginId: string): Promise<void> {
  const orgId = await requireOrgOwner();
  if (!/^[0-9a-f-]{36}$/i.test(loginId)) return;
  await createAdminClient().rpc("remove_payter_extra_login", { target_org: orgId, login_id: loginId });
  revalidatePath("/settings");
  revalidatePath("/terminals");
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
  // Whose phone it is, so their own choices in Meldingen apply to it (23-10-2026).
  const user = await getSessionUser();

  await createAdminClient()
    .from("push_subscriptions")
    .upsert(
      {
        endpoint: sub.endpoint,
        org_id: orgId,
        business_id: businessId,
        user_id: user?.id ?? null,
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

/** Zaak or automatenshop: whether this organisation rents machines or slots to businesses. */
export async function saveRentsToBusinesses(rents: boolean): Promise<void> {
  await requireOperator();
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Not found");
  // Renting to businesses is a package's to give (Automatenshop); switching it off never is.
  if (rents === true && !(await featureAllowed(orgId, "shareWithShops"))) throw new Error("Not in this package");
  const { error } = await createAdminClient()
    .from("organizations")
    .update({ rents_to_businesses: rents === true })
    .eq("id", orgId);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

/** Meldingen: one's own choices of what to hear about and how (23-10-2026). */
export async function saveNotifications(input: unknown): Promise<{ ok: true } | Extract<CleanPrefs, { ok: false }>> {
  await requireSignedIn();
  await denyFillerAccess();
  const { locale } = await getI18n();
  const result = await saveNotificationSettings(input, locale);
  if (!result.ok) return result;
  revalidatePath("/settings");
  return { ok: true };
}

/** "Stuur een test": one message now, on the channels chosen. */
export async function testNotifications() {
  await requireSignedIn();
  await denyFillerAccess();
  const result = await sendTestNotification();
  revalidatePath("/settings");
  return result;
}

/** "Bekijk de e-mail": the overview as it would arrive, nothing sent. */
export async function previewEmail() {
  await requireSignedIn();
  await denyFillerAccess();
  return getEmailPreview();
}
