import { cache } from "react";
import { REQUIRE_LOGIN } from "@/lib/auth-config";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** What the person in front of the app is allowed to see. */
export type Scope = {
  orgId: string | null;
  /** One business, or null for the whole organisation (the operator). */
  businessId: string | null;
};

/**
 * Resolves what to show. Prefers the logged-in user's own membership; falls
 * back to the first organization when no one is logged in, so the app works
 * without accounts during early/solo use. A membership tied to a business
 * narrows everything to that business — a shop sees its own machines and its
 * own share of a shared one, never the rest of the operator's fleet.
 * Cached per request.
 */
export const getScope = cache(async (): Promise<Scope> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: membership } = await supabase
      .from("memberships")
      .select("org_id, business_id")
      .single();
    if (membership) {
      return {
        orgId: membership.org_id as string,
        businessId: (membership.business_id as string | null) ?? null,
      };
    }
  }
  if (REQUIRE_LOGIN) return { orgId: null, businessId: null };

  const { data: org } = await createAdminClient()
    .from("organizations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return { orgId: (org?.id as string) ?? null, businessId: null };
});

export async function getCurrentOrgId(): Promise<string | null> {
  return (await getScope()).orgId;
}

/** The business to narrow to, or null when the whole organisation is visible. */
export async function getCurrentBusinessId(): Promise<string | null> {
  return (await getScope()).businessId;
}

export async function requireOrgId(): Promise<string> {
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("No organization found");
  return orgId;
}
