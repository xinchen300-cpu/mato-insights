// "Elke transactie nog eens op camera" (Xin, 21-10-2026): UniFi Protect opens a
// camera's recording at a moment with this address, copied from Xin's own
// browser. It starts a little before the payment, to see the customer come up
// to the machine. How far back it goes is up to the recorder's own storage;
// MATO Info keeps nothing. No server code here: Net verkocht builds it in the browser.

/** Twenty seconds before the payment: choosing and tapping come first. */
const BEFORE_MS = 20_000;

export type CameraRef = { consoleId: string; cameraId: string };

/**
 * A camera aimed at a machine, with the name it had in UniFi when it was linked (21-10-2026: a machine can have several).
 * fullHd: whether it makes full HD photos, where known (22-10-2026); only the photo route reads it.
 */
export type LinkedCamera = CameraRef & { name: string | null; fullHd?: boolean | null };

// Console ids carry a colon ("…3222:1223282583"); UniFi's own links keep it as it is.
const part = (value: string) => (/^[A-Za-z0-9:_-]+$/.test(value) ? value : encodeURIComponent(value));

export function recordingUrl(camera: CameraRef, at: string | Date): string {
  const start = new Date(at).getTime() - BEFORE_MS;
  return `https://unifi.ui.com/consoles/${part(camera.consoleId)}/protect/timelapse/${part(camera.cameraId)}?start=${start}`;
}
