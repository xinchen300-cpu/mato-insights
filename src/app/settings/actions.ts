"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncOrganizationPayterData } from "@/lib/payter/sync";

async function currentOrgId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: membership } = await supabase
    .from("memberships")
    .select("org_id")
    .single();
  if (!membership) throw new Error("No organization found for this user");

  return membership.org_id as string;
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
