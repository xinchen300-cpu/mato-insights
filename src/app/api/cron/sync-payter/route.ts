import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncOrganizationPayterData } from "@/lib/payter/sync";

// Vercel Cron sends this on every scheduled invocation.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: orgs, error } = await supabase.from("payter_credentials").select("org_id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = await Promise.all(
    (orgs ?? []).map(async (row) => ({
      orgId: row.org_id,
      ...(await syncOrganizationPayterData(row.org_id)),
    })),
  );

  return NextResponse.json({ results });
}
