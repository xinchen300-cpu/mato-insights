"use server";

import { revalidatePath } from "next/cache";
import { requireSignedIn } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";

const NAME_MAX = 40;

/** One's own name, as rounds and lists show it: one line, at most NAME_MAX characters. */
export async function saveProfileName(raw: unknown): Promise<{ ok: boolean }> {
  await requireSignedIn();
  const name = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (!name || name.length > NAME_MAX) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ data: { name } });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
  return { ok: true };
}
