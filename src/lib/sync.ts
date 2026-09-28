import { SUPABASE_URL } from "@/lib/supabase/config";

export type SyncResult = { status: "success" | "error"; transactionsSynced: number; error?: string };

// The sync engine lives in the payter-sync Edge Function (also run every 5
// minutes by pg_cron); this just asks it to run now for one organization.
export async function triggerPayterSync(orgId: string): Promise<SyncResult> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/payter-sync`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ orgId }),
    cache: "no-store",
  });
  if (!res.ok) return { status: "error", transactionsSynced: 0, error: `HTTP ${res.status}` };

  const json = await res.json();
  return json.results?.[0] ?? { status: "error", transactionsSynced: 0, error: "no result" };
}
