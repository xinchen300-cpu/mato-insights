"use server";

import { revalidatePath } from "next/cache";
import { cleanLook } from "@/lib/avatar";
import { requireRefillAccess } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";

/**
 * The figure next to one's level: kept on one's own account, by whoever fills
 * (a filler or the operator), for themselves only. What is stored is only what
 * cleanLook lets through.
 */
export async function saveAvatar(raw: unknown): Promise<void> {
  await requireRefillAccess();
  const look = cleanLook(raw);
  if (!look) throw new Error("Invalid avatar");
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ data: { avatar: look } });
  if (error) throw new Error(error.message);
  revalidatePath("/refill");
  revalidatePath("/refill/me");
}
