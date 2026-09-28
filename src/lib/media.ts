import { SUPABASE_URL } from "@/lib/supabase/config";

export const MEDIA_BUCKET = "media";

export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/${MEDIA_BUCKET}/${path}`;
}
