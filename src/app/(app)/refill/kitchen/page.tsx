import { notFound } from "next/navigation";
import { EmptyState, PageHeader, Section } from "@/components/page-header";
import { ProductionListView } from "@/components/production/production-list";
import { RefillTabs } from "@/components/refill/refill-tabs";
import { getI18n } from "@/i18n/server";
import { getProductionLists } from "@/lib/data";
import { denyFiller, isOperator, requireOrgId } from "@/lib/org";
import { countFridge, passOrder } from "./actions";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.kitchen.title };
}

/**
 * The kitchen list (Xin, 19-10-2026): per producer what to make tonight for
 * tomorrow's round. Only on the owner's account; the operator passes it on to
 * the kitchen as a message, and the kitchen itself types nothing.
 */
export default async function KitchenPage() {
  await denyFiller();
  if (!(await isOperator())) notFound();
  const { m } = await getI18n();
  const lists = await getProductionLists(await requireOrgId());

  return (
    <>
      <PageHeader title={m.kitchen.title} actions={<RefillTabs active="kitchen" m={m} />} />
      {lists.length === 0 ? (
        <EmptyState title={m.kitchen.title} hint={m.kitchen.noProducers} />
      ) : (
        <div className="flex max-w-2xl flex-col gap-10">
          {lists.map((list) => (
            <Section key={list.producerId} title={list.producerName}>
              <ProductionListView
                list={list}
                passOrder={passOrder.bind(null, list.producerId)}
                countFridge={countFridge.bind(null, list.producerId)}
              />
            </Section>
          ))}
        </div>
      )}
    </>
  );
}
