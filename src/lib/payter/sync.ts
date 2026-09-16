import { createAdminClient } from "@/lib/supabase/admin";
import {
  payterAuthenticate,
  payterFetchTransactions,
  type PayterCredentials,
  type PayterTransaction,
} from "./client";

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // re-auth 5min before expiry

type SyncResult = {
  status: "success" | "error";
  transactionsSynced: number;
  error?: string;
};

export async function syncOrganizationPayterData(orgId: string): Promise<SyncResult> {
  const supabase = createAdminClient();

  const { data: logRow } = await supabase
    .from("sync_logs")
    .insert({ org_id: orgId, status: "running" })
    .select("id")
    .single();

  try {
    const { data: credRow, error: credError } = await supabase
      .from("payter_credentials")
      .select("last_watermark, cached_token, token_expires_at")
      .eq("org_id", orgId)
      .single();

    if (credError || !credRow) {
      throw new Error("No Payter credentials configured for this organization");
    }

    const { data: secret, error: secretError } = await supabase.rpc(
      "get_payter_credentials",
      { target_org: orgId },
    );

    if (secretError || !secret) {
      throw new Error("Could not decrypt stored Payter credentials");
    }

    const credentials = secret as PayterCredentials;

    let tokenId = credRow.cached_token as string | null;
    const tokenExpiresAt = credRow.token_expires_at
      ? new Date(credRow.token_expires_at).getTime()
      : 0;

    if (!tokenId || tokenExpiresAt - TOKEN_REFRESH_BUFFER_MS < Date.now()) {
      const auth = await payterAuthenticate(credentials);
      tokenId = auth.tokenId;
      await supabase
        .from("payter_credentials")
        .update({
          cached_token: tokenId,
          token_expires_at: new Date(Date.now() + auth.expiresIn * 1000).toISOString(),
        })
        .eq("org_id", orgId);
    }

    const fromIngestTime = credRow.last_watermark ?? 0;
    let maxIngestTimeSeen = fromIngestTime;
    let transactionsSynced = 0;

    const locationCache = new Map<string, string>(); // name -> location_id
    const machineCache = new Map<string, string>(); // serialNumber -> machine_id

    for await (const page of payterFetchTransactions(tokenId, fromIngestTime)) {
      for (const doc of page) {
        const machineId = await resolveMachine(
          supabase,
          orgId,
          doc,
          locationCache,
          machineCache,
        );

        await supabase.from("transactions").upsert(
          {
            org_id: orgId,
            machine_id: machineId,
            payter_transaction_id: doc.id,
            amount: doc.committedAmount / 100,
            currency: doc.currency ?? "EUR",
            payment_method: doc.ifd ?? null,
            disposition: doc.disposition ?? null,
            occurred_at: doc.txnTimestamp,
            item_ref: doc.itemRef ?? null,
            raw_json: doc,
          },
          { onConflict: "org_id,payter_transaction_id" },
        );

        transactionsSynced += 1;
        const ingestMs = new Date(doc.ingestTime).getTime();
        if (ingestMs > maxIngestTimeSeen) {
          maxIngestTimeSeen = ingestMs;
        }
      }
    }

    await supabase
      .from("payter_credentials")
      .update({
        last_watermark: maxIngestTimeSeen,
        last_synced_at: new Date().toISOString(),
      })
      .eq("org_id", orgId);

    if (logRow) {
      await supabase
        .from("sync_logs")
        .update({
          status: "success",
          transactions_synced: transactionsSynced,
          finished_at: new Date().toISOString(),
        })
        .eq("id", logRow.id);
    }

    return { status: "success", transactionsSynced };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (logRow) {
      await supabase
        .from("sync_logs")
        .update({ status: "error", error: message, finished_at: new Date().toISOString() })
        .eq("id", logRow.id);
    }
    return { status: "error", transactionsSynced: 0, error: message };
  }
}

async function resolveMachine(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  doc: PayterTransaction,
  locationCache: Map<string, string>,
  machineCache: Map<string, string>,
): Promise<string | null> {
  const serialNumber = doc.serialNumber;
  if (!serialNumber) return null;

  const cached = machineCache.get(serialNumber);
  if (cached) return cached;

  const { data: existingMachine } = await supabase
    .from("machines")
    .select("id")
    .eq("org_id", orgId)
    .eq("payter_serial_number", serialNumber)
    .maybeSingle();

  if (existingMachine) {
    machineCache.set(serialNumber, existingMachine.id);
    return existingMachine.id;
  }

  const locationName = doc.siteDomain || doc.terminalDomain || "Unassigned";
  let locationId = locationCache.get(locationName);

  if (!locationId) {
    const { data: existingLocation } = await supabase
      .from("locations")
      .select("id")
      .eq("org_id", orgId)
      .eq("name", locationName)
      .maybeSingle();

    if (existingLocation) {
      locationId = existingLocation.id;
    } else {
      const { data: newLocation } = await supabase
        .from("locations")
        .insert({ org_id: orgId, name: locationName })
        .select("id")
        .single();
      locationId = newLocation?.id;
    }

    if (locationId) locationCache.set(locationName, locationId);
  }

  const { data: newMachine } = await supabase
    .from("machines")
    .insert({
      org_id: orgId,
      location_id: locationId ?? null,
      name: serialNumber,
      payter_serial_number: serialNumber,
    })
    .select("id")
    .single();

  if (newMachine) machineCache.set(serialNumber, newMachine.id);
  return newMachine?.id ?? null;
}
