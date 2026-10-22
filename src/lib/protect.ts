import { EVENTS_PAGE, eventsQuery, parseProtectEvents } from "@/lib/protect-events";
import { createAdminClient } from "@/lib/supabase/admin";
import { CameraBusyError, consoleCameras, protectPrivate } from "@/lib/unifi";

// Bezoekers (22-10-2026): UniFi Protect's own person detections, read into protect_events console by console.
// Only camera, kind and time are kept (protect-events.ts drops everything else); the cameras' names and what they
// are set to detect go to protect_cameras, how far each console was read to protect_sync. Infrastructure, not an
// organisation's data: who may see which camera is decided in data.ts.

const DAY_MS = 86_400_000;
/** The first read of a console goes back this far; Protect keeps its events for a while, not for ever. */
const BACKFILL_DAYS = 30;
/** Pages per run, each one call of the console's minute: a long first read finishes over a few runs. */
const MAX_PAGES = 8;
/** Every run reads the last half hour again: a detection still going on then has its end by now. */
const OVERLAP_MS = 30 * 60_000;
/** A console is read again when the page opens at most this often; the refresh button does not wait. */
export const SYNC_EVERY_MS = 5 * 60_000;

export type SyncState = {
  consoleId: string;
  syncedUntil: string | null;
  lastRun: string | null;
  lastError: string | null;
  lastCount: number;
};

type SyncRow = { console_id: string; synced_until: string; last_run: string; last_error: string | null; last_count: number };

export async function readSyncStates(consoleIds: string[]): Promise<SyncState[]> {
  if (!consoleIds.length) return [];
  const { data, error } = await createAdminClient()
    .from("protect_sync")
    .select("console_id, synced_until, last_run, last_error, last_count")
    .in("console_id", consoleIds);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as SyncRow[];
  return consoleIds.map((consoleId) => {
    const row = rows.find((r) => r.console_id === consoleId);
    return {
      consoleId,
      syncedUntil: row?.synced_until ?? null,
      lastRun: row?.last_run ?? null,
      lastError: row?.last_error ?? null,
      lastCount: row?.last_count ?? 0,
    };
  });
}

/** The consoles not read for SYNC_EVERY_MS, or all of them when asked to now. */
export function staleConsoles(states: SyncState[], force: boolean, now: number = Date.now()): string[] {
  return states
    .filter((state) => force || !state.lastRun || now - new Date(state.lastRun).getTime() >= SYNC_EVERY_MS)
    .map((state) => state.consoleId);
}

/**
 * Reads one console: its cameras, then the person detections since the last
 * read (or the last BACKFILL_DAYS the first time), oldest first, MAX_PAGES at
 * most. Never throws: how it went is stored with the console, and the next run
 * carries on from what was read.
 */
export async function syncProtectConsole(consoleId: string): Promise<void> {
  const admin = createAdminClient();
  const now = Date.now();
  const { data: state } = await admin.from("protect_sync").select("synced_until").eq("console_id", consoleId).maybeSingle();
  const previous = state?.synced_until ? new Date(state.synced_until as string).getTime() : null;
  const from = Math.max(previous !== null ? previous - OVERLAP_MS : 0, now - BACKFILL_DAYS * DAY_MS);
  let reached = previous ?? from;
  let count = 0;
  let failure: string | null = null;
  // Marked as read now, before reading: a second page opened meanwhile sees it fresh and does not read it again.
  await admin
    .from("protect_sync")
    .upsert({ console_id: consoleId, synced_until: new Date(reached).toISOString(), last_run: new Date(now).toISOString() }, { onConflict: "console_id" });
  try {
    const cameras = await consoleCameras(consoleId);
    if (cameras.length) {
      const { error } = await admin.from("protect_cameras").upsert(
        cameras.map((camera) => ({
          console_id: consoleId,
          camera_id: camera.id,
          name: camera.name,
          model: camera.model,
          detects: camera.detects,
          can_detect: camera.canDetect,
          online: camera.online,
          updated_at: new Date(now).toISOString(),
        })),
        { onConflict: "console_id,camera_id" },
      );
      if (error) throw new Error(error.message);
    }
    for (let page = 0; page < MAX_PAGES; page++) {
      const body = await protectPrivate(consoleId, `/events?${eventsQuery(from, now, page * EVENTS_PAGE)}`);
      const { events, received, lastStart } = parseProtectEvents(body, now);
      if (events.length) {
        const { error } = await admin.from("protect_events").upsert(
          events.map((event) => ({
            console_id: consoleId,
            event_id: event.eventId,
            camera_id: event.cameraId,
            kind: event.kind,
            objects: event.objects,
            started_at: event.startedAt,
            ended_at: event.endedAt,
            score: event.score,
            synced_at: new Date(now).toISOString(),
          })),
          { onConflict: "console_id,event_id" },
        );
        if (error) throw new Error(error.message);
      }
      count += events.length;
      if (received < EVENTS_PAGE) {
        reached = now;
        break;
      }
      // A full page: more to read. If this was the last page allowed, the next run starts at its newest event.
      reached = lastStart ?? reached;
    }
  } catch (error) {
    failure = error instanceof CameraBusyError ? "busy" : String(error).slice(0, 300);
    console.error("Protect events not read", { consoleId, error: failure });
  }
  const { error } = await admin.from("protect_sync").upsert(
    {
      console_id: consoleId,
      synced_until: new Date(reached).toISOString(),
      last_run: new Date(now).toISOString(),
      last_error: failure,
      last_count: count,
    },
    { onConflict: "console_id" },
  );
  if (error) console.error("Protect sync state not saved", { consoleId, error: error.message });
}
