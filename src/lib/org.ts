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
    // Filtered by hand as well as by the row policy, and ordered so that a
    // membership tied to a business wins: two rows must never widen what
    // someone sees. A logged-in stranger with no membership sees nothing at
    // all — never the fallback below, which exists only for no session.
    const { data: memberships } = await supabase
      .from("memberships")
      .select("org_id, business_id")
      .eq("user_id", user.id)
      .order("business_id", { nullsFirst: false });
    const membership = memberships?.[0];
    return membership
      ? {
          orgId: membership.org_id as string,
          businessId: (membership.business_id as string | null) ?? null,
        }
      : { orgId: null, businessId: null };
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

/**
 * Refuses when a business-scoped account reaches for another business. The
 * operator (no business on the membership) passes everything. Use this in any
 * action or loader that takes a business id from the client — an id in a URL
 * is a request, not a permission.
 */
export async function requireBusinessAccess(businessId: string | null | undefined): Promise<void> {
  const { businessId: own } = await getScope();
  if (own && businessId !== own) throw new Error("Not found");
}

/** True when the caller sees the whole fleet rather than one business. */
export async function isOperator(): Promise<boolean> {
  return (await getScope()).businessId === null;
}

/** Refuses anything but the operator: fleet-wide settings, credentials, producers. */
export async function requireOperator(): Promise<void> {
  if (!(await isOperator())) throw new Error("Not found");
}
