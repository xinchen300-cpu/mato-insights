"use server";

import { revalidatePath } from "next/cache";
import { requireOperator, requireOrgId } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";

// A producer supplies the fleet, so keeping the list is the operator's job.
export async function saveProducer(formData: FormData) {
  const orgId = await requireOrgId();
  await requireOperator();
  const id = String(formData.get("id") ?? "") || null;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const row = {
    name,
    email: String(formData.get("email") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
  };

  const admin = createAdminClient();
  if (id) {
    await admin.from("producers").update(row).eq("id", id).eq("org_id", orgId);
  } else {
    await admin.from("producers").insert({ org_id: orgId, ...row });
  }
  revalidatePath("/", "layout");
}

export async function deleteProducer(id: string) {
  const orgId = await requireOrgId();
  await requireOperator();
  await createAdminClient().from("producers").delete().eq("id", id).eq("org_id", orgId);
  revalidatePath("/", "layout");
}
