import { cache } from "react";
import { REQUIRE_LOGIN } from "@/lib/auth-config";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Resolves the org to show data for. Prefers the logged-in user's own org;
 * falls back to the first organization when no one is logged in, so the app
 * works without accounts during early/solo use. Cached per request.
 */
export const getCurrentOrgId = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: membership } = await supabase.from("memberships").select("org_id").single();
    if (membership) return membership.org_id as string;
  }
  if (REQUIRE_LOGIN) return null;

  const { data: org } = await createAdminClient()
    .from("organizations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (org?.id as string) ?? null;
});

export async function requireOrgId(): Promise<string> {
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("No organization found");
  return orgId;
}
