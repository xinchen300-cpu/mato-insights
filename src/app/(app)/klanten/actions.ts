"use server";

import { revalidatePath } from "next/cache";
import { requireOperator, requireOrgId } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";

export type NewCustomer = { ok: true; email: string; token: string | null } | { ok: false; reason: string };

/**
 * One customer: their own organisation plus the invitation they register with.
 * The database refuses this unless the caller's organisation is the one that
 * sells the app, so a customer can never mint customers of their own.
 */
export async function createCustomer(formData: FormData): Promise<NewCustomer> {
  const orgId = await requireOrgId();
  await requireOperator();

  const name = String(formData.get("company") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  const { error } = await createAdminClient().rpc("create_customer", {
    caller_org: orgId,
    company_name: name,
    owner_email: email,
  });
  if (error) return { ok: false, reason: error.message };

  // The invitation's token goes in the link; without it the address alone claims nothing.
  const { data: invite } = await createAdminClient().from("allowed_emails").select("token").eq("email", email).maybeSingle();
  revalidatePath("/klanten");
  return { ok: true, email, token: (invite?.token as string | null) ?? null };
}
