import { SUPABASE_URL } from "@/lib/supabase/config";

export const MEDIA_BUCKET = "media";

export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/${MEDIA_BUCKET}/${path}`;
}

/**
 * The picture a machine shows until it gets its own: the MATO C1 cut out from
 * its product folder (Xin, 16-10-2026). Drawn whole (contain), never cropped,
 * on the warm tile background; a real photo of the machine fills its frame.
 */
export const DEFAULT_MACHINE_PHOTO = "/machines/default.webp";
