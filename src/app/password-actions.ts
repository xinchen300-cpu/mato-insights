"use server";

/**
 * The tails of every leaked-password hash that starts with these five hex
 * characters, from HaveIBeenPwned's Pwned Passwords range API. Only the prefix
 * of a SHA-1 hash ever reaches this server; the password and the rest of its
 * hash stay in the browser, which does the comparison itself. Asking from here
 * instead of the browser keeps the person's IP address away from a third party.
 *
 * An empty list means "could not check": a broken lookup must never stop
 * someone from creating an account.
 */
export async function leakedHashTails(prefix: string): Promise<string[]> {
  if (!/^[0-9A-F]{5}$/.test(prefix)) return [];
  try {
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true", "User-Agent": "MATO-Insights" },
      next: { revalidate: 86_400 },
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return [];
    return (await response.text())
      .split("\n")
      .map((line) => line.trim().split(":"))
      // Padding rows carry a count of 0: they are decoys, not leaks.
      .filter(([tail, count]) => tail?.length === 35 && Number(count) > 0)
      .map(([tail]) => tail);
  } catch {
    return [];
  }
}
