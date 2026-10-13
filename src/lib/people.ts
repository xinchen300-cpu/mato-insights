import type { User } from "@supabase/supabase-js";

/**
 * What a person is called on a round: the name they gave when they signed up,
 * or the part of their email before the @. One rule everywhere, so the name on
 * a round finds its person again on the Vullers page.
 */
export function displayName(user: Pick<User, "email" | "user_metadata"> | null | undefined): string | null {
  const name = typeof user?.user_metadata?.name === "string" ? user.user_metadata.name.trim() : "";
  return name || user?.email?.split("@")[0] || null;
}
