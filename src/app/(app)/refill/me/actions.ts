"use server";

import { revalidatePath } from "next/cache";
import { cleanLook } from "@/lib/avatar";
import { requireSignedIn } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";

/**
 * The figure next to one's level, and on the profile page: kept on one's own
 * account, by whoever is signed in, for themselves only. What is stored is only
 * what cleanLook lets through.
 */
export async function saveAvatar(raw: unknown): Promise<void> {
  await requireSignedIn();
  const look = cleanLook(raw);
  if (!look) throw new Error("Invalid avatar");
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ data: { avatar: look } });
  if (error) throw new Error(error.message);
  revalidatePath("/refill");
  revalidatePath("/refill/me");
  revalidatePath("/profile");
}
