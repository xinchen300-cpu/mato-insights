import { getCamerasOf } from "@/lib/data";
import { denyFiller, requireOrgId } from "@/lib/org";
import { cameraSnapshot } from "@/lib/unifi";

/** A sharp photo through UniFi's cloud, and the usual one after it if needed: room for both. */
export const maxDuration = 40;

/**
 * "Toon automaat nu": a photo of this moment from the camera aimed at the
 * machine. Under /api, not /machines, so the app's service worker never keeps
 * an old one. Nothing is stored, here or in the browser.
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
    const { image, type } = await cameraSnapshot(camera.consoleId, camera.cameraId);
    return new Response(image, { headers: { "Content-Type": type, "Cache-Control": "private, no-store" } });
  } catch {
    return new Response(null, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
