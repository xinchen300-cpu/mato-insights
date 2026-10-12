"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireOperator, requireOrgId } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/** Who the operator can bring in themselves. Owners come from the vendor, shops from a business. */
const INVITABLE = ["filler", "admin"] as const;

export type InviteResult = { ok: true; email: string; token: string } | { ok: false; reason: "email" | "taken" | "failed" };

/**
 * Lets someone in: they sign up through the link with this address and land
 * in this organisation with this role. The link carries a token; signing up
 * with the address but without the token attaches nobody, so knowing an
 * invited address is not enough to take the seat. Someone who already has an
 * account opens the same link signed in and takes it up there.
 */
export async function inviteTeamMember(email: string, role: string): Promise<InviteResult> {
  const orgId = await requireOrgId();
  await requireOperator();
  const address = email.trim().toLowerCase();
  if (!EMAIL.test(address)) return { ok: false, reason: "email" };
  if (!(INVITABLE as readonly string[]).includes(role)) return { ok: false, reason: "failed" };

  const admin = createAdminClient();
  // One address, one invitation, across every organisation: the table is keyed
  // on it. Saying "taken" tells nothing about which organisation has it.
  const { data: existing } = await admin.from("allowed_emails").select("email").eq("email", address).maybeSingle();
  if (existing) return { ok: false, reason: "taken" };
  // An account that already belongs to an organisation cannot join a second.
  // One that belongs nowhere yet (registered without the link) can: signed in,
  // it takes up the invitation through the same link.
  const { data: state, error: stateError } = await admin.rpc("email_account_state", { address });
  if (stateError) return { ok: false, reason: "failed" };
  if (state === "member") return { ok: false, reason: "taken" };

  const token = randomBytes(18).toString("base64url");
  const { error } = await admin
    .from("allowed_emails")
    .insert({ email: address, org_id: orgId, role, business_id: null, token });
  if (error) return { ok: false, reason: error.code === "23505" ? "taken" : "failed" };
  revalidatePath("/settings");
  return { ok: true, email: address, token };
}

/** Takes back an invitation nobody has used yet. Only this organisation's. */
export async function revokeInvite(email: string): Promise<void> {
  const orgId = await requireOrgId();
  await requireOperator();
  await createAdminClient()
    .from("allowed_emails")
    .delete()
    .eq("org_id", orgId)
    .eq("email", email.trim().toLowerCase())
    .is("claimed_at", null);
  revalidatePath("/settings");
}

/**
 * Takes someone out of this organisation. Never yourself and never the owner,
 * so an organisation cannot lock itself out. Their invitation goes too, so the
 * same address can be invited again later.
 */
export async function removeMember(userId: string): Promise<void> {
  const orgId = await requireOrgId();
  await requireOperator();
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  if (user?.id === userId) throw new Error("Not allowed");

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("memberships")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!membership || membership.role === "owner") throw new Error("Not allowed");

  await admin.from("memberships").delete().eq("org_id", orgId).eq("user_id", userId);
  const { data } = await admin.auth.admin.getUserById(userId);
  if (data.user?.email) await admin.from("allowed_emails").delete().eq("org_id", orgId).eq("email", data.user.email.toLowerCase());
  revalidatePath("/settings");
}
