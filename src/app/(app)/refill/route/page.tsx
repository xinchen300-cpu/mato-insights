import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { RefillTabs } from "@/components/refill/refill-tabs";
import { getI18n } from "@/i18n/server";
import { getMachines, getRoundSettings, getRouteTimes } from "@/lib/data";
import { denyFiller, isOperator, requireOrgId } from "@/lib/org";
import { orderByRoute } from "@/lib/round-settings";
import { RouteEditor } from "./route-editor";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.route.tab };
}

/**
 * The route, for the owner: the order of the machines and the kilometres
 * between each stop. New rounds follow this order, and their kilometres (and
 * so their cost) are added up from these distances.
 */
export default async function RoutePage() {
  await denyFiller();
  if (!(await isOperator())) redirect("/refill");
  const { m } = await getI18n();
  const orgId = await requireOrgId();
  const [machines, settings, times] = await Promise.all([getMachines(orgId), getRoundSettings(orgId), getRouteTimes(orgId)]);
  const name = new Map(machines.map((machine) => [machine.id, machine.name]));
  return (
    <>
      <PageHeader title={m.refill.title} subtitle={m.route.subtitle} actions={<RefillTabs active="route" m={m} />} />
      <RouteEditor
        machines={orderByRoute(machines.map((machine) => machine.id), settings.route).map((id) => ({ id, name: name.get(id) ?? "—" }))}
        legs={settings.legs}
        times={times}
      />
    </>
  );
}
