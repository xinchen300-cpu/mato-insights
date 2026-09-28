import { MEDIA_BUCKET } from "@/lib/media";
import { createAdminClient } from "@/lib/supabase/admin";

const ALLOWED = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

/** Uploads an image to the public media bucket and returns its storage path. */
export async function uploadImage(orgId: string, folder: string, id: string, file: File): Promise<string> {
  const extension = ALLOWED.get(file.type);
  if (!extension) throw new Error("Unsupported image type");

  // A fresh name per upload so browsers and the CDN never show the old picture.
  const path = `${orgId}/${folder}/${id}-${Date.now()}.${extension}`;
  const { error } = await createAdminClient()
    .storage.from(MEDIA_BUCKET)
    .upload(path, file, { contentType: file.type, cacheControl: "31536000" });
  if (error) throw new Error(error.message);
  return path;
}

export async function removeImage(path: string | null | undefined) {
  if (!path) return;
  await createAdminClient().storage.from(MEDIA_BUCKET).remove([path]);
}

export function imageFrom(formData: FormData, key: string): File | null {
  const value = formData.get(key);
  return value instanceof File && value.size > 0 ? value : null;
}
