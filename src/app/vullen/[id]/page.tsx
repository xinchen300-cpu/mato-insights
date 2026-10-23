import { notFound } from "next/navigation";
import { getI18n } from "@/i18n/server";
import { cleanLook } from "@/lib/avatar";
import { getMyRounds, getRefillRound, getRouteTimes } from "@/lib/data";
import { displayName } from "@/lib/people";
import { createClient } from "@/lib/supabase/server";
import { isFiller, requireRefillAccess } from "@/lib/org";
import { RoundFlow } from "./round-flow";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.round.myRound, robots: { index: false, follow: false } };
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
  const [round, times, me, filler] = await Promise.all([
    getRefillRound(orgId, id),
    getRouteTimes(orgId),
    createClient().then((client) => client.auth.getUser()),
    isFiller(),
  ]);
  if (!round) notFound();
  // This person's earlier rounds only matter once this one ends, for what it
  // earned: not on every reload while the round is on.
  const ending = Boolean(round.completedAt) || round.machines.every((machine) => round.stops[machine.id]?.completedAt);
  const history = ending ? await getMyRounds(orgId) : null;
  return (
    <RoundFlow
      round={round}
      who={displayName(me.data.user)}
      look={cleanLook(me.data.user?.user_metadata?.avatar)}
      times={times}
      history={history}
      filler={filler}
    />
  );
}
