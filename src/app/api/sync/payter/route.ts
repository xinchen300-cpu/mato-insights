import { NextResponse } from "next/server";
import { getCurrentOrgId } from "@/lib/org";
import { syncOrganizationPayterData } from "@/lib/payter/sync";

// Manual "sync now" for the current (or, pre-auth, the only) organization.
export async function POST() {
  const orgId = await getCurrentOrgId();

  if (!orgId) {
    return new NextResponse("No organization found", { status: 404 });
  }

  const result = await syncOrganizationPayterData(orgId);
  return NextResponse.json(result);
}
