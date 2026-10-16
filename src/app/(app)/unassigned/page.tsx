import { CircleCheck, Info } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page-header";
import { getI18n } from "@/i18n/server";
import { getPriceMismatches, getProducts, getUnassigned } from "@/lib/data";
import { denyFiller, requireOrgId } from "@/lib/org";
import { isRecent } from "@/lib/unassigned";
import { PriceMismatches } from "./price-mismatches";
import { UnassignedList } from "./unassigned-list";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.unassigned.title };
}

export default async function UnassignedPage() {
  await denyFiller();
  const { m, f } = await getI18n();
  const orgId = await requireOrgId();
  const [groups, products, mismatches] = await Promise.all([
    getUnassigned(orgId),
    getProducts(orgId),
    getPriceMismatches(orgId),
  ]);

  // Busiest selections first within each machine: those are worth naming first.
  // What sold lately is the to-do; what has not sold in 90 days comes after, apart.
  const sectionsOf = (list: typeof groups) => {
    const byMachine = new Map<string, { machineId: string; machineName: string; groups: typeof groups }>();
    for (const g of list) {
      const section = byMachine.get(g.machine_id) ?? { machineId: g.machine_id, machineName: g.machine_name, groups: [] };
      section.groups.push(g);
      byMachine.set(g.machine_id, section);
    }
    return [...byMachine.values()]
      .sort((a, b) => a.machineName.localeCompare(b.machineName))
      .map((s) => ({
        ...s,
        groups: s.groups
          .sort((a, b) => b.sales - a.sales)
          .map((g) => ({ ...g, lastSoldLabel: f.relative(g.last_sale) })),
      }));
  };
  const sections = sectionsOf(groups.filter((g) => isRecent(g)));
  const older = sectionsOf(groups.filter((g) => !isRecent(g)));

  return (
    <>
      <PageHeader
        title={m.unassigned.title}
        subtitle={m.unassigned.subtitle}
        backHref="/products"
        backLabel={m.nav.products}
      />
      <div className="flex flex-col gap-12">
        {sections.length === 0 && older.length === 0 ? (
          mismatches.length === 0 && (
            <EmptyState
              icon={<CircleCheck className="size-5" />}
              title={m.unassigned.allDone}
              hint={m.unassigned.allDoneHint}
            />
          )
        ) : (
          <div className="flex flex-col gap-8">
            <p className="flex items-start gap-2 px-1 text-[13.5px] leading-snug text-muted-foreground">
              <Info className="mt-px size-4 shrink-0" />
              {m.unassigned.firstLinkNote}
            </p>
            {sections.length > 0 && <UnassignedList sections={sections} products={products} />}
            {older.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="px-1 text-[15px] font-semibold text-muted-foreground">{m.unassigned.older}</h2>
                <UnassignedList sections={older} products={products} />
              </section>
            )}
          </div>
        )}

        {/* Linked to the wrong thing is a different problem from not linked. */}
        {mismatches.length > 0 && <PriceMismatches rows={mismatches} />}
      </div>
    </>
  );
}
