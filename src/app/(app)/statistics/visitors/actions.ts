"use server";

import { revalidatePath } from "next/cache";
import { visitorsRefresher } from "@/lib/data";
import { requireOperator, requireOrgId } from "@/lib/org";

/** "Ophalen bij UniFi": read the organisation's consoles now, whenever they were last read, then show the page again. */
export async function refreshVisitorsNow(): Promise<void> {
  await requireOperator();
  const orgId = await requireOrgId();
  const refresh = await visitorsRefresher(orgId, { force: true });
  if (refresh) await refresh();
  revalidatePath("/statistics/visitors");
}
