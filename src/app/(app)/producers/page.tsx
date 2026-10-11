import { PageHeader } from "@/components/page-header";
import { getI18n } from "@/i18n/server";
import { getProducers, getProducts, getShortages } from "@/lib/data";
import { denyFiller, requireOrgId } from "@/lib/org";
import { ProducerList } from "./producer-list";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.producers.title };
}

export default async function ProducersPage() {
  await denyFiller();
  const { m } = await getI18n();
  const orgId = await requireOrgId();
  const [producers, products, shortages] = await Promise.all([
    getProducers(orgId),
    getProducts(orgId),
    getShortages(orgId),
  ]);

  // How much of each producer's food could not be taken along.
  const producerOf = new Map(products.map((p) => [p.id, p.producer_id]));
  const shortBy = new Map<string, number>();
  for (const s of shortages) {
    const producerId = s.product_id ? producerOf.get(s.product_id) : null;
    if (!producerId) continue;
    shortBy.set(producerId, (shortBy.get(producerId) ?? 0) + s.qty);
  }

  const rows = producers.map((producer) => ({
    ...producer,
    products: products.filter((p) => p.producer_id === producer.id).length,
    short: shortBy.get(producer.id) ?? 0,
  }));

  return (
    <>
      <PageHeader title={m.producers.title} />
      <ProducerList producers={rows} />
    </>
  );
}
