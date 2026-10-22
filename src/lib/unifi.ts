// UniFi Protect through Ubiquiti's own cloud (api.ui.com), so nothing has to
// be opened at the shop: "Toon automaat nu" asks the camera aimed at a machine
// for a photo of this moment (Xin, 20-10-2026). Nothing is stored; the photo
// goes straight from the camera to the person who tapped.
//
// One key (UNIFI_API_KEY, from unifi.ui.com → Settings → API Keys) sees every
// camera on Xin's consoles and can steer them, so it never leaves the server,
// and only the organisations named in UNIFI_ORGS (ids, comma-separated) may
// list or view them: another operator on MATO Info must never see MATO's cameras.

import { CONSOLE_BUDGET, msToNextMinute, retryAfterMs, sharing } from "@/lib/camera-pace";
import { createAdminClient } from "@/lib/supabase/admin";

const API = "https://api.ui.com";
/** The connector itself gives up after 25 seconds. */
const TIMEOUT_MS = 20_000;

const ORGS = new Set(
  (process.env.UNIFI_ORGS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
);

function apiKey(): string | null {
  return process.env.UNIFI_API_KEY?.trim() || null;
}

/** True when this organisation may use the UniFi cameras of this deployment. */
export function camerasEnabled(orgId: string | null | undefined): boolean {
  return Boolean(orgId && apiKey() && ORGS.has(orgId));
}

async function call(path: string, accept = "application/json", timeout = TIMEOUT_MS): Promise<Response> {
  const key = apiKey();
  if (!key) throw new Error("UniFi is not set up");
  return fetch(`${API}${path}`, {
    headers: { "X-API-Key": key, Accept: accept },
    cache: "no-store",
    signal: AbortSignal.timeout(timeout),
  });
}

/** Protect's own API on one console, through the cloud connector. */
const protect = (consoleId: string, path: string) =>
  `/v1/connector/consoles/${encodeURIComponent(consoleId)}/protect/integration/v1${path}`;

export type UnifiCamera = {
  consoleId: string;
  consoleName: string;
  id: string;
  name: string;
  online: boolean;
  /** The model as UniFi names it ("G5 Bullet"), shown when picking a camera (22-10-2026). */
  model: string | null;
  /** Whether it can make a full HD photo through the API; null when UniFi does not say. */
  fullHd: boolean | null;
};

type CameraJson = {
  id: string;
  name: string | null;
  state: string;
  type?: string | null;
  featureFlags?: { supportFullHdSnapshot?: boolean } | null;
};

type Host = { id: string; reportedState?: { name?: string | null; hostname?: string | null } | null };

/** Every camera on every console the key can reach, by name. */
export async function listCameras(): Promise<UnifiCamera[]> {
  const hosts: Host[] = [];
  let next: string | undefined;
  do {
    const res = await call(`/v1/hosts?pageSize=100${next ? `&nextToken=${encodeURIComponent(next)}` : ""}`);
    if (!res.ok) throw new Error(`UniFi hosts: ${res.status}`);
    const body = (await res.json()) as { data?: Host[]; nextToken?: string | null };
    hosts.push(...(body.data ?? []));
    next = body.nextToken || undefined;
  } while (next && hosts.length < 500);

  const perConsole = await Promise.all(
    hosts.map(async (host) => {
      // A console without Protect, or one that is offline, simply adds no cameras.
      try {
        const res = await call(protect(host.id, "/cameras"));
        if (!res.ok) return [];
        const cameras = (await res.json()) as CameraJson[];
        const consoleName = host.reportedState?.name || host.reportedState?.hostname || "UniFi";
        return cameras.map((camera) => ({
          consoleId: host.id,
          consoleName,
          id: camera.id,
          name: camera.name || camera.id,
          online: camera.state === "CONNECTED",
          model: camera.type?.replace(/^UVC\s+/i, "").trim() || null,
          fullHd: typeof camera.featureFlags?.supportFullHdSnapshot === "boolean" ? camera.featureFlags.supportFullHdSnapshot : null,
        }));
      } catch {
        return [];
      }
    }),
  );
  return perConsole.flat().sort((a, b) => a.name.localeCompare(b.name));
}

const isJpeg = (image: ArrayBuffer) => {
  const head = new Uint8Array(image, 0, Math.min(3, image.byteLength));
  return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
};

/**
 * Cameras that said they cannot make a full HD photo (Diksmuide's, 21-10-2026):
 * asked for the usual one straight away, so "Live" costs one call per
 * photo against UniFi's 100 a minute. Kept for as long as this server runs;
 * since 22-10-2026 also with the camera's link (machine_cameras.full_hd), so a
 * restarted server does not ask in vain first.
 */
const NO_FULL_HD = new Set<string>();

/** Consoles UniFi told to wait (429), and until when. Kept for as long as this server runs. */
const WAIT_UNTIL = new Map<string, number>();

/** No photo now: UniFi, or MATO Info's own share of the console's minute, says wait this long. */
export class CameraBusyError extends Error {
  constructor(readonly retryAfterMs: number) {
    super("UniFi is busy");
  }
}

/**
 * One call against this console's minute, counted in the database
 * (unifi_call_take), so every MATO Info server, live and test, shares one count.
 * Gives the calls taken this minute, this one included; over CONSOLE_BUDGET it
 * is a CameraBusyError. When the database cannot count, the photo goes ahead:
 * UniFi's own limit still stands behind it.
 */
async function takeCall(consoleId: string): Promise<number> {
  const waitUntil = WAIT_UNTIL.get(consoleId) ?? 0;
  if (waitUntil > Date.now()) throw new CameraBusyError(waitUntil - Date.now());
  let used: unknown = null;
  try {
    const { data, error } = await createAdminClient().rpc("unifi_call_take", { p_console: consoleId, p_limit: CONSOLE_BUDGET });
    if (error) throw new Error(error.message);
    used = data;
  } catch (error) {
    console.error("UniFi calls not counted", { error: String(error) });
  }
  if (typeof used !== "number") return 0;
  if (used < 0) throw new CameraBusyError(msToNextMinute());
  return used;
}

export type CameraShot = {
  image: ArrayBuffer;
  type: string;
  /** The full HD photo, rather than the camera's usual one. */
  sharp: boolean;
  /** The camera just said it cannot make a full HD photo: worth remembering with its link. */
  noFullHd: boolean;
  /** How long UniFi took, every try together. */
  ms: number;
  /** Calls this console has taken this minute, the last one included. */
  used: number;
};

/**
 * A photo of this moment: sharp (1080p or more) to see the slots, or the
 * camera's usual one when the sharp one fails or takes too long. A camera
 * known to have no full HD (fullHd false) is asked for the usual one at once.
 * A photo the connector labels as something else still counts if it is one.
 * Every failure is logged with what UniFi answered, never with the key; a
 * 429 makes the whole console wait as long as UniFi asks.
 */
export async function cameraSnapshot(consoleId: string, cameraId: string, fullHd: boolean | null = null): Promise<CameraShot> {
  const started = Date.now();
  let noFullHd = false;
  for (const sharp of fullHd === false || NO_FULL_HD.has(cameraId) ? [false] : [true, false]) {
    const used = await takeCall(consoleId);
    const path = protect(consoleId, `/cameras/${encodeURIComponent(cameraId)}/snapshot${sharp ? "?highQuality=true" : ""}`);
    try {
      const res = await call(path, "*/*", sharp ? 12_000 : TIMEOUT_MS);
      if (res.status === 429) {
        const wait = retryAfterMs(res.headers.get("retry-after"));
        WAIT_UNTIL.set(consoleId, Date.now() + wait);
        console.error("UniFi asked to wait", { wait });
        throw new CameraBusyError(wait);
      }
      const image = await res.arrayBuffer();
      const type = res.headers.get("content-type") ?? "";
      if (res.ok && (type.startsWith("image/") || isJpeg(image))) {
        const ms = Date.now() - started;
        if (ms > 8_000) console.warn("UniFi snapshot slow", { ms, sharp });
        return { image, type: type.startsWith("image/") ? type : "image/jpeg", sharp, noFullHd, ms, used };
      }
      const said = type.includes("json") || type.startsWith("text/") ? new TextDecoder().decode(image.slice(0, 300)) : `${image.byteLength} bytes`;
      // UniFi's own answer for such a camera: "Camera does not support full HD snapshot".
      if (sharp && res.status === 400 && /full HD/i.test(said)) {
        NO_FULL_HD.add(cameraId);
        noFullHd = true;
        continue;
      }
      console.error("UniFi snapshot refused", { sharp, status: res.status, type, said });
    } catch (error) {
      if (error instanceof CameraBusyError) throw error;
      console.error("UniFi snapshot failed", { sharp, error: String(error) });
    }
  }
  throw new Error("UniFi snapshot failed");
}

/**
 * cameraSnapshot, shared: whoever asks for the same camera within SHARE_MS
 * gets the same photo and costs UniFi nothing (as the client sites do since
 * 21-10-2026). Per server; a photo never goes to anyone the caller has not
 * already let through to that camera.
 */
export const sharedSnapshot = sharing(
  (camera: { consoleId: string; cameraId: string; fullHd: boolean | null }) => `${camera.consoleId}/${camera.cameraId}`,
  (camera) => cameraSnapshot(camera.consoleId, camera.cameraId, camera.fullHd),
);
