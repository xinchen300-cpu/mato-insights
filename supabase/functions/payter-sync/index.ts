// Pulls new Payter transactions into Vendly. Runs every 15 seconds via pg_cron
// (job `payter-sync-every-15-sec`) and on demand from the "Sync now" button.
// Payter itself takes about half a minute to make a sale available, so a sale
// shows in Vendly well within a minute.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const PAYTER_API_BASE = "https://api.mypayter.com/API";
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const PAGE_SIZE = 1000;
// Payter rejects offset + maxResults beyond ~10,000 (Elasticsearch window), so
// restart the query from an advanced watermark before reaching it.
const MAX_OFFSET_BEFORE_RESTART = 8000;
// Keeps a single run short enough to end before the next one starts, 15 seconds
// later. A large backlog simply continues on the next run from the saved watermark.
const MAX_PAGES_PER_RUN = 3;
// Terminal status (connection, firmware, settings) changes slowly: once every 5
// minutes is plenty, and it spares Payter a request every 15 seconds.
const TERMINALS_EVERY_MS = 5 * 60 * 1000;
const RUN_EVERY_MS = 15 * 1000;

type PayterCredentials = { username: string; password: string; domain: string };

type PayterTransaction = {
  id: string;
  serialNumber?: string;
  committedAmount?: number;
  authorizedAmount?: number;
  requestedAmount?: number;
  currency?: string;
  disposition?: string;
  ifd?: string;
  itemRef?: unknown;
  txnTimestamp: string;
  ingestTime: string;
  [key: string]: unknown;
};

type PayterTerminal = {
  serialNumber?: string;
  lastConnected?: number;
  network?: unknown;
  configStatus?: unknown;
  model?: { name?: string };
  data?: Record<string, unknown>;
};

type SyncResult = { status: "success" | "error"; transactionsSynced: number; error?: string };

/**
 * One MyPayter login. A business's own sits in payter_credentials, one per business; since 22-10-2026 a business
 * can add more (Mato Vending has a second account with two machines), each a row of payter_extra_logins with its
 * own watermark and token. Both are read and written the same way, by table and key.
 */
type Login = {
  orgId: string;
  table: "payter_credentials" | "payter_extra_logins";
  key: "org_id" | "id";
  id: string;
  /** The account code of a further login, to tell its failures apart; null for the business's own. */
  domain: string | null;
};

const ownLogin = (orgId: string): Login => ({ orgId, table: "payter_credentials", key: "org_id", id: orgId, domain: null });
const extraLogin = (row: { id: string; org_id: string; domain: string }): Login => ({
  orgId: row.org_id,
  table: "payter_extra_logins",
  key: "id",
  id: row.id,
  domain: row.domain,
});

Deno.serve(async (req) => {
  // verify_jwt already guarantees the token is signed by this project, so its
  // role claim can be trusted; only the service role may trigger a sync.
  if (jwtRole(req.headers.get("Authorization")) !== "service_role") {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const body = await req.json().catch(() => ({}));

  // Just show what is on this Payter account, importing nothing. The operator
  // picks which terminals are theirs before any of it becomes a machine.
  if (body?.action === "terminals" && typeof body?.orgId === "string") {
    try {
      const terminals = await listTerminals(supabase, body.orgId);
      return Response.json({ terminals });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return Response.json({ terminals: [], error: message }, { status: 200 });
    }
  }

  let orgIds: string[];
  if (typeof body?.orgId === "string") {
    orgIds = [body.orgId];
  } else {
    const { data } = await supabase.from("payter_credentials").select("org_id");
    orgIds = (data ?? []).map((r) => r.org_id as string);
  }

  // On demand ("Sync now") always; from the schedule, in one run per 5 minutes.
  const withTerminals = typeof body?.orgId === "string" || Date.now() % TERMINALS_EVERY_MS < RUN_EVERY_MS;

  // The businesses' own logins first, exactly as before; further logins after, so they never hold those up.
  const logins = [...orgIds.map(ownLogin), ...(await extraLogins(supabase, typeof body?.orgId === "string" ? body.orgId : null))];

  // The first result is the business's own login: "Sync now" reads that one.
  const results = [];
  for (const login of logins) {
    results.push({ orgId: login.orgId, ...(login.domain ? { domain: login.domain } : {}), ...(await syncLogin(supabase, login, withTerminals)) });
  }
  return Response.json({ results });
});

/** The further logins, of one business or of all; none when they cannot be read, so the own logins still run. */
async function extraLogins(supabase: SupabaseClient, orgId: string | null): Promise<Login[]> {
  let query = supabase.from("payter_extra_logins").select("id, org_id, domain").order("created_at");
  if (orgId) query = query.eq("org_id", orgId);
  const { data, error } = await query;
  if (error) return [];
  return (data ?? []).map((row) => extraLogin(row as { id: string; org_id: string; domain: string }));
}

/**
 * Every terminal on the business's Payter accounts, its own login and any further one, each terminal once. An
 * account that does not answer fails the whole list: an incomplete one would read as machines that left.
 */
async function listTerminals(supabase: SupabaseClient, orgId: string) {
  const seen = new Map<string, ReturnType<typeof terminalRow>>();
  for (const login of [ownLogin(orgId), ...(await extraLogins(supabase, orgId))]) {
    for (const row of await listLoginTerminals(supabase, login)) if (!seen.has(row.serial)) seen.set(row.serial, row);
  }
  return [...seen.values()];
}

function terminalRow(t: PayterTerminal) {
  return {
    serial: t.serialNumber as string,
    model: t.model?.name ?? null,
    last_connected: isoDate(t.data?.["Last Connect Date"] ?? t.lastConnected),
    site: (t.data?.["Site Reference"] as string | undefined) ?? null,
  };
}

/** Every terminal on one account, with what the operator needs to recognise it. */
async function listLoginTerminals(supabase: SupabaseClient, login: Login) {
  const { data: credRow } = await supabase
    .from(login.table)
    .select("cached_token, token_expires_at")
    .eq(login.key, login.id)
    .single();
  if (!credRow) throw new Error("No Payter credentials configured");

  const tokenId = await getToken(supabase, login, credRow);
  const res = await fetch(`${PAYTER_API_BASE}/Data`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `CURO-TOKEN token="${tokenId}"` },
    body: JSON.stringify({
      index: "Terminals",
      query: "",
      maxResults: 200,
      offset: 0,
      sorts: [],
      filters: [],
      aggregations: [],
    }),
  });
  if (!res.ok) throw new Error(`Payter terminal request failed (${res.status})`);

  const terminals: PayterTerminal[] = (await res.json()).documents ?? [];
  return terminals.filter((t) => t.serialNumber).map(terminalRow);
}

async function syncLogin(supabase: SupabaseClient, login: Login, withTerminals: boolean): Promise<SyncResult> {
  const { orgId } = login;
  let transactionsSynced = 0;

  try {
    const { data: credRow, error: credError } = await supabase
      .from(login.table)
      .select("last_watermark, cached_token, token_expires_at")
      .eq(login.key, login.id)
      .single();
    if (credError || !credRow) throw new Error("No Payter credentials configured");

    const tokenId = await getToken(supabase, login, credRow);

    const { data: excludedRows } = await supabase
      .from("machines")
      .select("payter_serial_number")
      .eq("org_id", orgId)
      .eq("excluded", true);
    const excludedSerials = new Set(
      (excludedRows ?? []).map((m) => m.payter_serial_number as string | null).filter(Boolean),
    );

    const machineCache = new Map<string, string>();
    let watermark: number = credRow.last_watermark ?? 0;
    // The query starts at the watermark itself, so the last sale already in comes
    // back every run. It is upserted again, harmlessly, but it is not news.
    const startedAt = watermark;
    let pages = 0;

    for await (const page of fetchTransactions(tokenId, watermark)) {
      // Terminals owned by other businesses on the shared Payter account.
      const included = page.filter(
        (doc) => !doc.serialNumber || !excludedSerials.has(doc.serialNumber),
      );

      if (included.length > 0) {
        const machineIds = await resolveMachines(supabase, orgId, included, machineCache);
        const rows = included.map((doc) => ({
          org_id: orgId,
          machine_id: doc.serialNumber ? (machineIds.get(doc.serialNumber) ?? null) : null,
          payter_transaction_id: doc.id,
          amount: (doc.committedAmount ?? doc.authorizedAmount ?? doc.requestedAmount ?? 0) / 100,
          currency: doc.currency ?? "EUR",
          payment_method: doc.ifd ?? null,
          disposition: doc.disposition ?? null,
          occurred_at: doc.txnTimestamp,
          // A few approved sales carry "[]" instead of a selection number.
          item_ref:
            typeof doc.itemRef === "string" && /^\d+$/.test(doc.itemRef) ? doc.itemRef : null,
          raw_json: stripNulBytes(doc),
        }));

        const { error } = await supabase
          .from("transactions")
          .upsert(rows, { onConflict: "org_id,payter_transaction_id" });
        if (error) throw new Error(`Transaction upsert failed: ${error.message}`);
        transactionsSynced += included.filter((doc) => new Date(doc.ingestTime).getTime() > startedAt).length;
      }

      // Advance on every document, excluded or not, so excluded data is never re-scanned.
      for (const doc of page) {
        const t = new Date(doc.ingestTime).getTime();
        if (t > watermark) watermark = t;
      }
      // Saved per page so an interrupted run loses at most one page of progress.
      await supabase
        .from(login.table)
        .update({ last_watermark: watermark })
        .eq(login.key, login.id);

      if (++pages >= MAX_PAGES_PER_RUN) break;
    }

    await supabase
      .from(login.table)
      .update({ last_synced_at: new Date().toISOString() })
      .eq(login.key, login.id);

    // Status is a nice-to-have: a failure here never fails the sales sync.
    if (withTerminals) await syncTerminals(supabase, login, tokenId).catch(() => {});

    // A run every 15 seconds would otherwise flood the log with empty entries.
    if (transactionsSynced > 0) {
      await supabase.from("sync_logs").insert({
        org_id: orgId,
        status: "success",
        transactions_synced: transactionsSynced,
        finished_at: new Date().toISOString(),
      });
    }
    return { status: "success", transactionsSynced };
  } catch (err) {
    const thrown = err instanceof Error ? err.message : String(err);
    // Payter can drop a session long before it says it expires (all of them at 01:00 on 23-10-2026, 14 hours without
    // sales). A refused session is forgotten, so the next run logs in again instead of retrying it until it expires.
    if (/\(401\)/.test(thrown)) {
      await supabase
        .from(login.table)
        .update({ cached_token: null, token_expires_at: null })
        .eq(login.key, login.id);
    }
    // A further login's failure carries its account code, so Settings can show it on that account's row.
    const message = login.domain ? `${login.domain}: ${thrown}` : thrown;
    await supabase.from("sync_logs").insert({
      org_id: orgId,
      status: "error",
      error: message,
      transactions_synced: transactionsSynced,
      finished_at: new Date().toISOString(),
    });
    return { status: "error", transactionsSynced, error: message };
  }
}

async function getToken(
  supabase: SupabaseClient,
  login: Login,
  credRow: { cached_token: string | null; token_expires_at: string | null },
): Promise<string> {
  const expiresAt = credRow.token_expires_at ? new Date(credRow.token_expires_at).getTime() : 0;
  if (credRow.cached_token && expiresAt - TOKEN_REFRESH_BUFFER_MS > Date.now()) {
    return credRow.cached_token;
  }

  const { data: secret, error } =
    login.table === "payter_credentials"
      ? await supabase.rpc("get_payter_credentials", { target_org: login.orgId })
      : await supabase.rpc("get_payter_extra_login", { login_id: login.id });
  if (error || !secret) throw new Error("Could not decrypt stored Payter credentials");

  const res = await fetch(`${PAYTER_API_BASE}/Auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(secret as PayterCredentials),
  });
  if (!res.ok) throw new Error(`Payter login failed (${res.status})`);
  const auth = await res.json();

  await supabase
    .from(login.table)
    .update({
      cached_token: auth.tokenId,
      token_expires_at: new Date(Date.now() + auth.expiresIn * 1000).toISOString(),
    })
    .eq(login.key, login.id);
  return auth.tokenId as string;
}

// Payter's documented import pattern: complete transactions ordered by
// ingestTime, from the last watermark. The boundary record can repeat across
// pages; the upsert on payter_transaction_id makes that harmless.
async function* fetchTransactions(
  tokenId: string,
  fromIngestTime: number,
): AsyncGenerator<PayterTransaction[]> {
  let from = fromIngestTime;
  while (true) {
    let offset = 0;
    let maxInWindow = from;
    while (true) {
      const res = await fetch(`${PAYTER_API_BASE}/Data`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `CURO-TOKEN token="${tokenId}"`,
        },
        body: JSON.stringify({
          index: "Transactions",
          query: "",
          maxResults: PAGE_SIZE,
          offset,
          sorts: [{ field: "ingestTime", asc: true }],
          filters: [
            { type: "range", field: "ingestTime", from },
            { type: "term", field: "complete", matches: "true" },
          ],
          aggregations: [],
        }),
      });
      if (!res.ok) throw new Error(`Payter data request failed (${res.status})`);

      const docs: PayterTransaction[] = (await res.json()).documents ?? [];
      if (docs.length === 0) return;
      yield docs;

      for (const doc of docs) {
        const t = new Date(doc.ingestTime).getTime();
        if (t > maxInWindow) maxInWindow = t;
      }
      if (docs.length < PAGE_SIZE) return;

      offset += PAGE_SIZE;
      if (offset > MAX_OFFSET_BEFORE_RESTART) break;
    }
    from = maxInWindow;
  }
}

// Each terminal's connection and what maintenance Payter flags (a firmware
// update, settings not yet applied). Payter holds a standing connection and
// reconnects it nightly, so the pair of connect/disconnect dates tells whether
// a terminal is up right now.
async function syncTerminals(supabase: SupabaseClient, login: Login, tokenId: string) {
  const { orgId } = login;
  const res = await fetch(`${PAYTER_API_BASE}/Data`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `CURO-TOKEN token="${tokenId}"` },
    body: JSON.stringify({
      index: "Terminals",
      query: "",
      maxResults: 200,
      offset: 0,
      sorts: [],
      filters: [],
      aggregations: [],
    }),
  });
  if (!res.ok) return;
  const terminals: PayterTerminal[] = (await res.json()).documents ?? [];

  for (const terminal of terminals) {
    if (!terminal.serialNumber) continue;
    await supabase
      .from("machines")
      .update({
        last_connected_at: isoDate(terminal.data?.["Last Connect Date"] ?? terminal.lastConnected),
        last_disconnected_at: isoDate(terminal.data?.["Last Disconnect Date"]),
        terminal_model: terminal.model?.name ?? null,
        terminal_network: Array.isArray(terminal.network) ? terminal.network.join(", ") : null,
        terminal_flags: Array.isArray(terminal.configStatus) ? terminal.configStatus.map(String) : [],
      })
      .eq("org_id", orgId)
      .eq("payter_serial_number", terminal.serialNumber);
  }

  // Which terminals a further login carries: a terminal claimed later rewinds this login, not the business's own.
  if (login.table === "payter_extra_logins") {
    const serials = terminals.map((t) => t.serialNumber).filter((s): s is string => Boolean(s));
    await supabase.from(login.table).update({ serials }).eq(login.key, login.id);
  }
}

async function resolveMachines(
  supabase: SupabaseClient,
  orgId: string,
  page: PayterTransaction[],
  cache: Map<string, string>,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const unknown = new Set<string>();

  for (const doc of page) {
    if (!doc.serialNumber) continue;
    const cached = cache.get(doc.serialNumber);
    if (cached) result.set(doc.serialNumber, cached);
    else unknown.add(doc.serialNumber);
  }
  if (unknown.size === 0) return result;

  const { data: existing } = await supabase
    .from("machines")
    .select("id, payter_serial_number")
    .eq("org_id", orgId)
    .in("payter_serial_number", [...unknown]);
  for (const m of existing ?? []) {
    cache.set(m.payter_serial_number, m.id);
    result.set(m.payter_serial_number, m.id);
    unknown.delete(m.payter_serial_number);
  }
  if (unknown.size === 0) return result;

  // A terminal nobody asked for is parked, not adopted: one Payter login can
  // carry other people's machines, and a reseller account always does. It
  // shows up in the picker under Settings, where the operator says whether it
  // is theirs and what it should be called. Until then its sales stay out.
  const { data: created } = await supabase
    .from("machines")
    .insert(
      [...unknown].map((serial) => ({
        org_id: orgId,
        name: serial,
        payter_serial_number: serial,
        excluded: true,
      })),
    )
    .select("id, payter_serial_number");
  for (const m of created ?? []) {
    cache.set(m.payter_serial_number, m.id);
    result.set(m.payter_serial_number, m.id);
  }
  return result;
}

function isoDate(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function jwtRole(authorization: string | null): string | null {
  const payload = authorization?.replace(/^Bearer /, "").split(".")[1];
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json).role ?? null;
  } catch {
    return null;
  }
}

const NUL = String.fromCharCode(0);

// Postgres jsonb rejects NUL bytes; Payter's txn-context-merchant field sometimes ends with one.
function stripNulBytes<T>(value: T): T {
  if (typeof value === "string") return value.replaceAll(NUL, "") as T;
  if (Array.isArray(value)) return value.map(stripNulBytes) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = stripNulBytes(v);
    return out as T;
  }
  return value;
}
