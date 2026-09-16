import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncOrganizationPayterData } from "@/lib/payter/sync";

// Manual "sync now" — requires a logged-in member of the org being synced.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("org_id")
    .single();

  if (!membership) {
    return new NextResponse("No organization found for this user", { status: 404 });
  }

  const result = await syncOrganizationPayterData(membership.org_id);
  return NextResponse.json(result);
}
