"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/org";
import { syncOrganizationPayterData } from "@/lib/payter/sync";

async function currentOrgId() {
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("No organization found");
  return orgId;
}

export async function connectPayter(formData: FormData) {
  const orgId = await currentOrgId();

  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const domain = String(formData.get("domain") ?? "").trim();

  if (!username || !password || !domain) {
    throw new Error("Username, password, and domain are all required");
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("set_payter_credentials", {
    target_org: orgId,
    p_username: username,
    p_password: password,
    p_domain: domain,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/settings");
}

export async function triggerSync() {
  const orgId = await currentOrgId();
  const result = await syncOrganizationPayterData(orgId);
  revalidatePath("/settings");
  return result;
}
