"use server";

import { isInvited } from "@/lib/signup";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

/**
 * Checked before the account is created, so an uninvited address never ends up
 * as a stray user. Says only yes or no — never who is invited.
 */
export async function checkInvite(email: string, token: string | null): Promise<boolean> {
  return isInvited(email, token && TOKEN.test(token) ? token : null);
}

export type ClaimResult = "ok" | "invalid" | "other_email" | "has_org" | "signed_out";

/**
 * Someone who already has an account takes up an invitation: signed in, with
 * the link's token, and only for the address the invitation was for. The
 * account comes from the session, never from the request.
 */
export async function claimInvite(token: string): Promise<ClaimResult> {
  if (!TOKEN.test(token)) return "invalid";
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  if (!user) return "signed_out";
  const { data, error } = await createAdminClient().rpc("claim_invite", { target_user: user.id, invite_token: token });
  if (error) return "invalid";
  return data === "ok" || data === "other_email" || data === "has_org" ? data : "invalid";
}
