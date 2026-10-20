import { getMachineCamera } from "@/lib/data";
import { denyFiller, requireOrgId } from "@/lib/org";
import { cameraSnapshot } from "@/lib/unifi";

/**
 * "Toon automaat nu": a photo of this moment from the camera aimed at the
 * machine. Under /api, not /machines, so the app's service worker never keeps
 * an old one. Nothing is stored, here or in the browser.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ machineId: string }> }) {
  await denyFiller();
  const { machineId } = await params;
  const orgId = await requireOrgId();
  const camera = await getMachineCamera(orgId, machineId).catch(() => null);
  if (!camera) return new Response(null, { status: 404 });
  try {
    const { image, type } = await cameraSnapshot(camera.consoleId, camera.cameraId);
    return new Response(image, { headers: { "Content-Type": type, "Cache-Control": "private, no-store" } });
  } catch {
    return new Response(null, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
