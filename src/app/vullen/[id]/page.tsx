import { notFound } from "next/navigation";
import { getI18n } from "@/i18n/server";
import { getRefillRound } from "@/lib/data";
import { requireRefillAccess } from "@/lib/org";
import { RoundFlow } from "./round-flow";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.round.pickTitle, robots: { index: false, follow: false } };
}

/**
 * Doing a refill round, full screen and without the app's menus: the operator
 * or one of their fillers. A shop cannot open it, and the round must be one of
 * this organisation's.
 */
export default async function RoundPage({ params }: { params: Promise<{ id: string }> }) {
  // A shop, or no organisation at all: the same answer as a round that does not exist.
  const orgId = await requireRefillAccess().catch(() => null);
  if (!orgId) notFound();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const round = await getRefillRound(orgId, id);
  if (!round) notFound();
  return <RoundFlow round={round} />;
}
