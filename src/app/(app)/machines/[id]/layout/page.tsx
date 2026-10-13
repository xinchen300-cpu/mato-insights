import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { fmt } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import {
  canEditLayout,
  getBusinesses,
  getCurrentAssignments,
  getLayoutTemplates,
  getMachine,
  getMachines,
  getMachineStock,
  getProducts,
} from "@/lib/data";
import { denyFiller, isOperator, requireOrgId } from "@/lib/org";
import { LayoutBuilder, type CopySource, type ExistingSlot } from "./layout-builder";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.machines.layout };
}

export default async function LayoutPage({ params }: { params: Promise<{ id: string }> }) {
  await denyFiller();
  const { id } = await params;
  const { m } = await getI18n();
  const orgId = await requireOrgId();

  const machine = await getMachine(orgId, id);
  if (!machine) notFound();
  // A shop on a shared machine puts products in its own slots on the machine's
  // page; drawing the whole machine is the operator's (canEditLayout).
  if (!(await canEditLayout(machine))) redirect(`/machines/${id}`);

  const [allSlots, machines, templates, products, assignments, businesses] = await Promise.all([
    getMachineStock(orgId),
    getMachines(orgId),
    getLayoutTemplates(orgId),
    getProducts(orgId),
    getCurrentAssignments(orgId, id),
    getBusinesses(orgId),
  ]);

  // A shared machine's two businesses, in seat order; empty for a machine of one.
  const owners = machine.shared_business_id
    ? [machine.business_id, machine.shared_business_id].flatMap((ownerId) => {
        const b = businesses.find((x) => x.id === ownerId);
        return b ? [{ id: b.id, name: b.name }] : [];
      })
    : [];

  const toExisting = (machineId: string): ExistingSlot[] =>
    allSlots
      .filter((s) => s.machine_id === machineId)
      .map((s) => ({
        row: s.row_position,
        selection: s.selection_number,
        size: s.size,
        depth: s.capacity,
        owner: s.business_id,
      }));

  const copySources: CopySource[] = machines
    .filter((mc) => mc.id !== id)
    .map((mc) => ({ id: mc.id, name: mc.name, type: mc.type, slots: toExisting(mc.id) }))
    .filter((mc) => mc.slots.length > 0);

  return (
    <>
      <PageHeader
        backHref={`/machines/${id}`}
        backLabel={machine.name}
        title={fmt(m.layout.title, { machine: machine.name })}
        subtitle={m.layout.subtitle}
      />
      <LayoutBuilder
        machineId={id}
        machineName={machine.name}
        initialType={machine.type}
        existing={toExisting(id)}
        templates={templates}
        copySources={copySources}
        products={products}
        initialAssignments={Object.fromEntries(assignments)}
        owners={owners}
        canSaveTemplate={await isOperator()}
      />
    </>
  );
}
