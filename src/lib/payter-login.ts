const PAYTER_AUTH = "https://api.mypayter.com/API/Auth";
const PAYTER_DATA = "https://api.mypayter.com/API/Data";

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

/**
 * Server side only. The serial numbers on one MyPayter account, asked right after a further account is added
 * (22-10-2026): a terminal claimed in the picker then winds back that account, also before the sync's own look at
 * the terminals five minutes later. Null when Payter does not answer.
 */
export async function payterTerminalSerials(username: string, password: string, domain: string): Promise<string[] | null> {
  try {
    const auth = await fetch(PAYTER_AUTH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, domain }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const tokenId = auth.ok ? ((await auth.json().catch(() => null)) as { tokenId?: unknown } | null)?.tokenId : null;
    if (typeof tokenId !== "string") return null;
    const res = await fetch(PAYTER_DATA, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `CURO-TOKEN token="${tokenId}"` },
      body: JSON.stringify({ index: "Terminals", query: "", maxResults: 200, offset: 0, sorts: [], filters: [], aggregations: [] }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const documents = ((await res.json().catch(() => null)) as { documents?: { serialNumber?: unknown }[] } | null)?.documents ?? [];
    return documents.map((d) => d.serialNumber).filter((s): s is string => typeof s === "string" && s.length > 0);
  } catch {
    return null;
  }
}
