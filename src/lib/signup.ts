import type { Role } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Signing up is by invitation. The page stays reachable while there is an
 * invitation nobody has claimed yet — and while there is no account at all,
 * so a fresh install can still be claimed by its first user.
 */
export async function canSignUp(): Promise<boolean> {
  const admin = createAdminClient();

  const { count: members } = await admin
    .from("memberships")
    .select("user_id", { count: "exact", head: true });
  if ((members ?? 0) === 0) return true;

  const { count: open } = await admin
    .from("allowed_emails")
    .select("email", { count: "exact", head: true })
    .is("claimed_at", null);
  return (open ?? 0) > 0;
}

/**
 * Whether this address may sign up with this link, checked before an account
 * is created. Only the address and the token together say yes: the address
 * alone is no proof of anything, and must not reveal who is invited.
 */
export async function isInvited(email: string, token: string | null): Promise<boolean> {
  const address = email.trim().toLowerCase();
  if (!address) return false;

  const { count: members } = await createAdminClient()
    .from("memberships")
    .select("user_id", { count: "exact", head: true });
  if ((members ?? 0) === 0) return true;
  if (!token) return false;

  const { data } = await createAdminClient()
    .from("allowed_emails")
    .select("email")
    .eq("email", address)
    .eq("token", token)
    .is("claimed_at", null)
    .maybeSingle();
  return !!data;
}

export type Invitation = { email: string; orgName: string; role: Role };

/** The open invitation behind a link, for the person holding that link. */
export async function invitationFor(token: string): Promise<Invitation | null> {
  const { data } = await createAdminClient()
    .from("allowed_emails")
    .select("email, role, organizations(name)")
    .eq("token", token)
    .is("claimed_at", null)
    .maybeSingle();
  if (!data) return null;
  const org = data.organizations as { name: string } | { name: string }[] | null;
  const orgName = (Array.isArray(org) ? org[0]?.name : org?.name) ?? "";
  return { email: data.email as string, orgName, role: data.role as Role };
}
