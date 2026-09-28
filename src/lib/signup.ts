import { createAdminClient } from "@/lib/supabase/admin";

// v1.1 has one operator account: signing up is only possible until someone
// has claimed the existing organization.
export async function canSignUp(): Promise<boolean> {
  const { count } = await createAdminClient().from("memberships").select("user_id", { count: "exact", head: true });
  return (count ?? 0) === 0;
}
