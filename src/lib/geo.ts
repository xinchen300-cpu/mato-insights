// Where an address is on the map, for the machines on Bijvullen (Xin, 21-10-2026:
// "a map with all the machines, pin pointed"). Looked up once with
// OpenStreetMap's Nominatim and kept in the table geocodes, keyed on the address
// in lower case: an address is never asked twice, and a page never waits for it.
// Nominatim allows one question a second and asks to be named, so new addresses
// are looked up after the page has gone out, a few at a time.

import { createAdminClient } from "@/lib/supabase/admin";

export type Point = { lat: number; lon: number };

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "MATO Info (info@matoautomaat.be)";
/** At most this many new addresses per page view: a second each. */
const PER_VISIT = 4;

/** The address as the table keeps it, the same as lower(btrim(address)) in SQL. */
export const geoKey = (address: string) => address.trim().toLowerCase();

/**
 * The places already known for these addresses: a point, null for one
 * Nominatim could not find, and nothing for one not looked up yet.
 */
export async function knownPoints(addresses: string[]): Promise<Map<string, Point | null>> {
  const keys = [...new Set(addresses.map(geoKey).filter(Boolean))];
  const points = new Map<string, Point | null>();
  if (keys.length === 0) return points;
  const { data, error } = await createAdminClient().from("geocodes").select("query, latitude, longitude, found").in("query", keys);
  if (error) throw error;
  for (const row of data ?? []) {
    points.set(
      row.query as string,
      row.found && row.latitude !== null && row.longitude !== null ? { lat: Number(row.latitude), lon: Number(row.longitude) } : null,
    );
  }
  return points;
}

/** Looks up the addresses not known yet, a few per call, one a second, and keeps what it finds (or that it found nothing). */
export async function lookUpMissing(addresses: string[], known: Map<string, Point | null>): Promise<void> {
  const missing = [...new Set(addresses.map(geoKey).filter((key) => key && !known.has(key)))].slice(0, PER_VISIT);
  const admin = createAdminClient();
  for (const [i, key] of missing.entries()) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, 1100));
    try {
      const url = `${NOMINATIM}?${new URLSearchParams({ q: key, format: "jsonv2", limit: "1", countrycodes: "be,nl,fr,lu,de" })}`;
      const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Accept-Language": "nl" }, signal: AbortSignal.timeout(8000) });
      if (!response.ok) continue; // tried again on a next visit
      const [hit] = (await response.json()) as { lat: string; lon: string }[];
      await admin.from("geocodes").upsert({
        query: key,
        latitude: hit ? Number(hit.lat) : null,
        longitude: hit ? Number(hit.lon) : null,
        found: Boolean(hit),
      });
    } catch (error) {
      console.error("geocode failed", key, error instanceof Error ? error.message : error);
    }
  }
}
