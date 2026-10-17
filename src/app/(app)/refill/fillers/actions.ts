"use server";

import { revalidatePath } from "next/cache";
import { requireOperator, requireOrgId } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";
import { imageFrom, removeImage, uploadImage } from "@/lib/upload";

/**
 * A photo of someone in the team, chosen by the operator, so the Vullers page
 * shows faces instead of letters. Only for a person of this organisation (the
 * id comes from the page: it is a request, not a permission), and kept in the
 * account's app_metadata, which only the server can write.
 */
export async function savePersonPhoto(userId: string, formData: FormData): Promise<void> {
  await requireOperator();
  const orgId = await requireOrgId();
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("Not found");
  const admin = createAdminClient();
  const { data: member, error: memberError } = await admin
    .from("memberships")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .is("business_id", null)
    .maybeSingle();
  if (memberError) throw new Error(memberError.message);
  if (!member) throw new Error("Not found");

  const photo = imageFrom(formData, "photo");
  if (!photo) return;
  const { data, error: readError } = await admin.auth.admin.getUserById(userId);
  if (readError || !data.user) throw new Error("Not found");
  const previous = data.user.app_metadata?.photo_path;

  const path = await uploadImage(orgId, "people", userId, photo);
  const { error } = await admin.auth.admin.updateUserById(userId, { app_metadata: { photo_path: path } });
  if (error) {
    await removeImage(path);
    throw new Error(error.message);
  }
  // Only a photo this organisation put there is taken away.
  if (typeof previous === "string" && previous.startsWith(`${orgId}/people/`)) await removeImage(previous);
  revalidatePath("/refill/fillers");
}
