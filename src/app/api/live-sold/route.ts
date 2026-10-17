import { getLiveSold } from "@/lib/data";
import { requireRefillAccess } from "@/lib/org";

/** What sold since the given moment of arrival, for the filler's live list: never an amount. */
export async function GET(request: Request) {
  const orgId = await requireRefillAccess();
  const after = new URL(request.url).searchParams.get("after");
  const since = after && !Number.isNaN(Date.parse(after)) ? new Date(after).toISOString() : null;
  const sales = await getLiveSold(orgId, { after: since });
  return Response.json({ sales }, { headers: { "Cache-Control": "no-store" } });
}
