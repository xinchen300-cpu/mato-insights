import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Resolves the org to show data for. Prefers the logged-in user's own org;
 * falls back to the first organization in the database when no one is
 * logged in, so the dashboard works without requiring accounts during
 * early/solo use. Revisit once multiple organizations exist.
 */
export async function getCurrentOrgId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: membership } = await supabase
      .from("memberships")
      .select("org_id")
      .single();
    if (membership) return membership.org_id as string;
  }

  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (org?.id as string) ?? null;
}
