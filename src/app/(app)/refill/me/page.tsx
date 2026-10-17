import { notFound } from "next/navigation";
import { FillerFigures } from "@/components/filler/figures";
import { PageHeader } from "@/components/page-header";
import { DISPLAY_TIME_ZONE } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { getMachines, getMyRounds } from "@/lib/data";
import { fillerStats } from "@/lib/filler-stats";
import { requireRefillAccess } from "@/lib/org";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.me.title };
}

/**
 * The figures of whoever fills: their level, their records, their best time on
 * each route and their badges, from their own finished rounds. A filler or the
 * operator sees their own; a shop runs no rounds and gets "not found".
 */
export default async function MyFiguresPage() {
  const orgId = await requireRefillAccess().catch(() => null);
  if (!orgId) notFound();
  const { m } = await getI18n();
  const [rounds, machines] = await Promise.all([getMyRounds(orgId), getMachines(orgId)]);
  const stats = fillerStats(rounds, DISPLAY_TIME_ZONE);
  // Only the names of machines on this person's own routes go to the page.
  const onRoutes = new Set(stats.routes.flatMap((route) => route.machineIds));
  return (
    <>
      <PageHeader title={m.me.title} subtitle={m.me.subtitle} backHref="/refill" backLabel={m.nav.refill} />
      <FillerFigures
        stats={stats}
        names={Object.fromEntries(machines.filter((machine) => onRoutes.has(machine.id)).map((machine) => [machine.id, machine.name]))}
      />
    </>
  );
}
