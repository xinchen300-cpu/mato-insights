// UniFi Protect through Ubiquiti's own cloud (api.ui.com), so nothing has to
// be opened at the shop: "Toon automaat nu" asks the camera aimed at a machine
// for a photo of this moment (Xin, 20-10-2026). Nothing is stored; the photo
// goes straight from the camera to the person who tapped.
//
// One key (UNIFI_API_KEY, from unifi.ui.com → Settings → API Keys) sees every
// camera on Xin's consoles and can steer them, so it never leaves the server,
// and only the organisations named in UNIFI_ORGS (ids, comma-separated) may
// list or view them: another operator on MATO Info must never see MATO's cameras.

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
        const cameras = (await res.json()) as { id: string; name: string | null; state: string }[];
        const consoleName = host.reportedState?.name || host.reportedState?.hostname || "UniFi";
        return cameras.map((camera) => ({
          consoleId: host.id,
          consoleName,
          id: camera.id,
          name: camera.name || camera.id,
          online: camera.state === "CONNECTED",
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
 * A photo of this moment: sharp (1080p or more) to see the slots, or the
 * camera's usual one when the sharp one fails or takes too long. A photo the
 * connector labels as something else still counts if it is one. Every failure
 * is logged with what UniFi answered, never with the key.
 */
export async function cameraSnapshot(consoleId: string, cameraId: string): Promise<{ image: ArrayBuffer; type: string }> {
  for (const sharp of [true, false]) {
    const path = protect(consoleId, `/cameras/${encodeURIComponent(cameraId)}/snapshot${sharp ? "?highQuality=true" : ""}`);
    try {
      const res = await call(path, "*/*", sharp ? 12_000 : TIMEOUT_MS);
      const image = await res.arrayBuffer();
      const type = res.headers.get("content-type") ?? "";
      if (res.ok && (type.startsWith("image/") || isJpeg(image))) {
        return { image, type: type.startsWith("image/") ? type : "image/jpeg" };
      }
      const said = type.includes("json") || type.startsWith("text/") ? new TextDecoder().decode(image.slice(0, 300)) : `${image.byteLength} bytes`;
      console.error("UniFi snapshot refused", { sharp, status: res.status, type, said });
    } catch (error) {
      console.error("UniFi snapshot failed", { sharp, error: String(error) });
    }
  }
  throw new Error("UniFi snapshot failed");
}
