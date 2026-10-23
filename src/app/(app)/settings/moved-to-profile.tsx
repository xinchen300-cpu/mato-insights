"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Abonnement and Team are in Profiel where one's own settings are on (24-10-2026). A link to /settings#abonnement (a
 * plan that does not allow something) and the way back from a payment (?betaald=1) land there instead.
 */
export function MovedToProfile() {
  const router = useRouter();
  useEffect(() => {
    const { hash, search } = window.location;
    const paid = new URLSearchParams(search).get("betaald") === "1";
    if (hash === "#abonnement" || paid) router.replace(`/profile${paid ? "?betaald=1" : ""}#abonnement`);
  }, [router]);
  return null;
}
