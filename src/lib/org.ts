import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
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
 * Keeps an answer for the rest of one request, also where React's cache()
 * keeps nothing: route handlers and server actions, which otherwise asked the
 * session again for every check (six times for one poll of the live sales).
 * The key is this request's own cookie store, an object Next makes for every
 * request (and again for the page it renders after an action), so an answer
 * can never reach another request or another person, and it goes when the
 * request goes. A failed answer is not kept: the next check asks again.
 */
function perRequest<T>(resolve: () => Promise<T>): () => Promise<T> {
  const answers = new WeakMap<object, Promise<T>>();
  return async () => {
    const store = await cookies();
    const known = answers.get(store);
    if (known) return known;
    const answer = resolve();
    answers.set(store, answer);
    answer.catch(() => {
      if (answers.get(store) === answer) answers.delete(store);
    });
    return answer;
  };
}

/**
 * The session, asked of Supabase once per request: who is signed in, and the
 * client that asked. The membership is read with that same client, as it always
 * was: if the login was refreshed while asking, it carries the fresh one.
 */
const getSession = cache(
  perRequest(async () => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return { supabase, user };
  }),
);

/** Who is signed in: the same answer the access checks got in this request. */
export async function getSessionUser(): Promise<User | null> {
  return (await getSession()).user;
}

/**
 * One's own account only (Profiel): anyone signed in, a filler too, sees and
 * changes their own name and avatar there and nothing of anyone else's. Without
 * a session, to the login.
 */
export async function requireSignedIn(): Promise<User> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Resolves what to show. Prefers the logged-in user's own membership; falls
 * back to the first organization when no one is logged in, so the app works
 * without accounts during early/solo use. A membership tied to a business
 * narrows everything to that business — a shop sees its own machines and its
 * own share of a shared one, never the rest of the operator's fleet.
 * Once per request, in a page as much as in a route or a server action.
 */
export const getScope = cache(perRequest(resolveScope));

async function resolveScope(): Promise<Scope> {
  const { supabase, user } = await getSession();

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
}

/**
 * The name the app goes by for this organisation, where it has one of its own (Xin, 21-10-2026: the demo
 * account says "MATO"); null is MATO Info. Never fails a page: no session or no answer is the default.
 */
export const getOrgBrand = cache(async (): Promise<string | null> => {
  try {
    const orgId = (await getScope()).orgId;
    if (!orgId) return null;
    // Every page asks (the layout's titles and texts); a brand changes by hand, if ever.
    const known = brands.get(orgId);
    if (known && Date.now() - known.at < BRAND_TTL_MS) return known.name;
    const { data } = await createAdminClient().from("organizations").select("brand_name").eq("id", orgId).maybeSingle();
    const name = (typeof data?.brand_name === "string" ? data.brand_name.trim() : "") || null;
    brands.set(orgId, { name, at: Date.now() });
    return name;
  } catch {
    return null;
  }
});

/**
 * Brand names kept a few minutes per organisation, in this server process: one
 * round trip less before every page (22-10-2026, mobile speed). Not a secret:
 * only the name the app goes by, and only after the scope check above.
 */
const BRAND_TTL_MS = 5 * 60_000;
const brands = new Map<string, { name: string | null; at: number }>();

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
