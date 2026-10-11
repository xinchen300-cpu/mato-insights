import { leakedHashTails } from "@/app/password-actions";

/**
 * Has this password turned up in a known data breach? Supabase checks this
 * only on its paid plan, so the app does it itself, with the same k-anonymity
 * trick: hash in the browser, send five characters of the hash, compare the
 * rest locally. Resolves false when the check cannot be done.
 */
export async function isLeakedPassword(password: string): Promise<boolean> {
  try {
    const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(password));
    const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
    const tails = await leakedHashTails(hex.slice(0, 5));
    return tails.includes(hex.slice(5));
  } catch {
    return false;
  }
}
