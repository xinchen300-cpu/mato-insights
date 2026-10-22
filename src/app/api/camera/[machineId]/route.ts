import { liveInterval, NEXT_HEADER } from "@/lib/camera-pace";
import { getCamerasOf, rememberNoFullHd } from "@/lib/data";
import { denyFiller, requireOrgId } from "@/lib/org";
import { CameraBusyError, sharedSnapshot } from "@/lib/unifi";

/** A sharp photo through UniFi's cloud, and the usual one after it if needed: room for both. */
export const maxDuration = 40;

/**
 * "Toon automaat nu": a photo of this moment from the camera aimed at the
 * machine. Under /api, not /machines, so the app's service worker never keeps
 * an old one. Nothing is stored, here or in the browser.
 *
 * Since 22-10-2026: people looking at the same camera at the same moment share
 * one photo; X-Camera-Next tells Live how long to wait, slower as the console's
 * minute fills; a 429 with Retry-After says when to try again instead of a
 * failure; Server-Timing shows how long UniFi took.
 */
export async function GET(request: Request, { params }: { params: Promise<{ machineId: string }> }) {
  await denyFiller();
  const { machineId } = await params;
  const orgId = await requireOrgId();
  // One of this machine's own cameras (?camera=), or its first; never any other camera on the UniFi.
  const asked = new URL(request.url).searchParams.get("camera");
  const cameras = await getCamerasOf(orgId, machineId).catch(() => []);
  const camera = asked ? cameras.find((c) => c.cameraId === asked) : cameras[0];
  if (!camera) return new Response(null, { status: 404 });
  try {
    const { value: shot, shared } = await sharedSnapshot({
      consoleId: camera.consoleId,
      cameraId: camera.cameraId,
      fullHd: camera.fullHd ?? null,
    });
    if (shot.noFullHd && camera.fullHd !== false) {
      await rememberNoFullHd(orgId, machineId, camera.cameraId).catch((error) =>
        console.error("Full HD answer not remembered", { error: String(error) }),
      );
    }
    // A copy: the same photo may go to several people at once.
    return new Response(shot.image.slice(0), {
      headers: {
        "Content-Type": shot.type,
        "Cache-Control": "private, no-store",
        [NEXT_HEADER]: String(liveInterval(shot.used)),
        "Server-Timing": `unifi;dur=${shot.ms};desc="${shared ? "shared" : shot.sharp ? "full HD" : "usual"}"`,
      },
    });
  } catch (error) {
    if (error instanceof CameraBusyError) {
      return new Response(null, {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(error.retryAfterMs / 1000)), "Cache-Control": "no-store" },
      });
    }
    return new Response(null, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
