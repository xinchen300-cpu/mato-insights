const PAYTER_AUTH = "https://api.mypayter.com/API/Auth";

export type PayterLoginCheck = "ok" | "rejected" | "unreachable";

/**
 * Server side only (it sends a password). Tries a MyPayter login the way the
 * sync will, before anything is stored.
 * Saving details Payter refuses would have the sync try them again every five
 * minutes, and enough failed logins can lock the customer's Payter account.
 */
export async function checkPayterLogin(username: string, password: string, domain: string): Promise<PayterLoginCheck> {
  try {
    const res = await fetch(PAYTER_AUTH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, domain }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      const body = (await res.json().catch(() => null)) as { tokenId?: unknown } | null;
      return typeof body?.tokenId === "string" ? "ok" : "unreachable";
    }
    // 4xx: Payter answered and said no. Anything else is Payter having a bad moment.
    return res.status >= 400 && res.status < 500 ? "rejected" : "unreachable";
  } catch {
    return "unreachable";
  }
}
