import { PageHeader } from "@/components/page-header";
import { getI18n } from "@/i18n/server";
import { businessMachineIds, getBusinesses, getMachines } from "@/lib/data";
import { denyFiller, isOperator, requireOrgId } from "@/lib/org";
import { AddBusiness, BusinessList } from "./business-list";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.businesses.title };
}

export default async function BusinessesPage() {
  await denyFiller();
  const { m } = await getI18n();
  const orgId = await requireOrgId();
  const [businesses, machines] = await Promise.all([getBusinesses(orgId), getMachines(orgId)]);
  const machineIds = businessMachineIds(machines);

  const rows = businesses.map((b) => ({
    ...b,
    machineNames: machines.filter((mc) => machineIds.get(b.id)?.has(mc.id)).map((mc) => mc.name),
  }));

  return (
    <>
      <PageHeader
        title={m.businesses.title}
        backHref="/machines"
        backLabel={m.nav.machines}
        actions={(await isOperator()) ? <AddBusiness /> : undefined}
      />
      <BusinessList businesses={rows} />
    </>
  );
}
