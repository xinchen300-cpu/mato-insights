import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { RefillTabs } from "@/components/refill/refill-tabs";
import { getI18n } from "@/i18n/server";
import { getFillerOverview, getMachines, getProducts, getRoundSettings, getRunRates } from "@/lib/data";
import { denyFiller, isOperator, requireOrgId } from "@/lib/org";
import { roundCost } from "@/lib/refill-flow";
import { WorkflowStudio } from "./workflow-studio";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.workflow.tab };
}

/**
 * How a round goes, step by step, with what the filler and the operator each
 * see; and the operator's own say in it: checks at every machine, a message,
 * kilometres, skipping, notifications.
 */
export default async function WorkflowPage() {
  await denyFiller();
  // How the fillers work is the operator's to shape.
  if (!(await isOperator())) redirect("/refill");
  const { m, f } = await getI18n();
  const orgId = await requireOrgId();
  const [settings, machines, products, people, rates] = await Promise.all([
    getRoundSettings(orgId),
    getMachines(orgId),
    getProducts(orgId),
    getFillerOverview(orgId),
    getRunRates(orgId),
  ]);
  // The previews show this organisation's own machines, products, people and rates.
  // The example carries a real name: one of the team's fillers, else the person looking.
  const filler =
    [...people.team.map((person) => person.name), ...people.fillers.map((person) => person.name), people.me].find(
      (name): name is string => !!name && name !== "—",
    ) ?? null;
  const example = roundCost({ minutes: 72, km: 38, machineKm: [], ...rates });

  return (
    <>
      <PageHeader title={m.refill.title} subtitle={m.workflow.subtitle} actions={<RefillTabs active="workflow" m={m} />} />
      <WorkflowStudio
        initial={settings}
        filler={filler}
        machines={machines.slice(0, 3).map((machine) => machine.name)}
        products={products.slice(0, 4).map((product) => product.name)}
        cost={f.euro(example.total)}
      />
    </>
  );
}
