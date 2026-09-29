import Link from "next/link";
import { ArrowRight, Factory, Link2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { fmt } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import {
  getBusinesses,
  getProducers,
  getProducts,
  getProductSlotCounts,
  getShelfLifePresets,
  getUnassigned,
} from "@/lib/data";
import { requireOrgId } from "@/lib/org";
import { ProductGrid } from "./product-grid";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.products.title };
}

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ business?: string }> }) {
  const { business } = await searchParams;
  const { m } = await getI18n();
  const orgId = await requireOrgId();
  const [products, slotCounts, unassigned, businesses, presets, producers] = await Promise.all([
    getProducts(orgId, { includeArchived: true }),
    getProductSlotCounts(orgId),
    getUnassigned(orgId),
    getBusinesses(orgId),
    getShelfLifePresets(orgId),
    getProducers(orgId),
  ]);

  return (
    <>
      <PageHeader
        title={m.products.title}
        subtitle={m.products.subtitle}
        actions={
          <Link href="/producers" className={buttonVariants({ variant: "outline" })}>
            <Factory />
            {m.producers.title}
          </Link>
        }
      />

      {unassigned.length > 0 && (
        <Link
          href="/unassigned"
          className="group mb-6 flex items-center gap-4 border border-warning/40 bg-card p-4 transition-colors hover:border-warning"
        >
          <Link2 className="size-5 shrink-0 text-warning" />
          <span className="flex-1 text-[15px]">{fmt(m.overview.unassigned, { count: unassigned.length })}</span>
          <ArrowRight className="size-4 shrink-0 text-accent-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}

      <ProductGrid
        products={products}
        slotCounts={Object.fromEntries(slotCounts)}
        businesses={businesses.map((b) => ({ id: b.id, name: b.name }))}
        initialBusiness={businesses.some((b) => b.id === business) ? business : ""}
        presets={presets}
        producers={producers.map((p) => ({ id: p.id, name: p.name }))}
      />
    </>
  );
}
