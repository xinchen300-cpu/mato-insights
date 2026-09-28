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

/** Whether this address was invited, checked before an account is created. */
export async function isInvited(email: string): Promise<boolean> {
  const address = email.trim().toLowerCase();
  if (!address) return false;

  const { count: members } = await createAdminClient()
    .from("memberships")
    .select("user_id", { count: "exact", head: true });
  if ((members ?? 0) === 0) return true;

  const { data } = await createAdminClient()
    .from("allowed_emails")
    .select("email")
    .eq("email", address)
    .is("claimed_at", null)
    .maybeSingle();
  return !!data;
}
