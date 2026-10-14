import { getLiveSales } from "@/lib/data";
import { denyFiller, getCurrentOrgId } from "@/lib/org";

/** What sold since the given moment of arrival, for the live strip on the overview. */
export async function GET(request: Request) {
  await denyFiller();
  const orgId = await getCurrentOrgId();
  if (!orgId) return Response.json({ sales: [] }, { status: 401 });
  const after = new URL(request.url).searchParams.get("after");
  const since = after && !Number.isNaN(Date.parse(after)) ? new Date(after).toISOString() : null;
  const sales = await getLiveSales(orgId, { after: since });
  return Response.json({ sales }, { headers: { "Cache-Control": "no-store" } });
}
