import { cache } from "react";
import { redirect } from "next/navigation";
import { REQUIRE_LOGIN } from "@/lib/auth-config";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type Role = "owner" | "admin" | "member" | "filler";

/** What the person in front of the app is allowed to see. */
export type Scope = {
  orgId: string | null;
  /** One business, or null for the whole organisation (the operator, or a filler). */
  businessId: string | null;
  /**
   * A filler does the refill work for the whole organisation and nothing else:
   * no revenue, no settings. Not an operator, even without a business.
   */
  role: Role | null;
};

/** The narrowest first: a business beats a filler, a filler beats the operator. */
const narrowness = (row: { business_id: unknown; role: unknown }) => (row.business_id ? 0 : row.role === "filler" ? 1 : 2);

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
    // Filtered by hand as well as by the row policy, and ordered so that the
    // narrowest membership wins: two rows must never widen what someone sees.
    // A logged-in stranger with no membership sees nothing at all — never the
    // fallback below, which exists only for no session.
    const { data: memberships } = await supabase
      .from("memberships")
      .select("org_id, business_id, role")
      .eq("user_id", user.id);
    const membership = [...(memberships ?? [])].sort((a, b) => narrowness(a) - narrowness(b))[0];
    return membership
      ? {
          orgId: membership.org_id as string,
          businessId: (membership.business_id as string | null) ?? null,
          role: membership.role as Role,
        }
      : { orgId: null, businessId: null, role: null };
  }
  if (REQUIRE_LOGIN) return { orgId: null, businessId: null, role: null };

  const { data: org } = await createAdminClient()
    .from("organizations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return { orgId: (org?.id as string) ?? null, businessId: null, role: "owner" };
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
  await denyFillerAccess();
  if (own && businessId !== own) throw new Error("Not found");
}

/**
 * True when the caller runs the whole fleet: an owner or a manager, with no
 * business on the membership. Named roles let in, nothing else: a filler, a
 * shop, or any role added later is refused until it is named here.
 */
export async function isOperator(): Promise<boolean> {
  const { businessId, role } = await getScope();
  return businessId === null && (role === "owner" || role === "admin");
}

/** Refuses anything but the operator: fleet-wide settings, credentials, producers. */
export async function requireOperator(): Promise<void> {
  if (!(await isOperator())) throw new Error("Not found");
}

export async function isFiller(): Promise<boolean> {
  return (await getScope()).role === "filler";
}

/**
 * Refuses a filler. The machine, product and business checks call this, so an
 * action that only checks "is this your machine" is not opened to fillers by
 * accident; their own work goes through requireRefillAccess instead.
 */
export async function denyFillerAccess(): Promise<void> {
  if (await isFiller()) throw new Error("Not found");
}

/**
 * Refill work: the operator or a filler, for their own organisation. Never a
 * business member — a shop does not run rounds over the operator's fleet.
 */
export async function requireRefillAccess(): Promise<string> {
  const { orgId, businessId, role } = await getScope();
  if (!orgId || businessId !== null || !(role === "owner" || role === "admin" || role === "filler")) {
    throw new Error("Not found");
  }
  return orgId;
}

/**
 * For every page a filler has no business on: sends them to their own work.
 * Call it first in a page or route, before anything is loaded.
 */
export async function denyFiller(): Promise<void> {
  if (await isFiller()) redirect("/refill");
}
