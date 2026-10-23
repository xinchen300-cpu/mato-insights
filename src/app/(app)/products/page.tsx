import { Link2 } from "lucide-react";
import { Avatar, ListRow, RowList } from "@/components/list-row";
import { plural } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { getBusinesses, getProducers, getProducts, getShelfLifePresets, getUnassigned } from "@/lib/data";
import { denyFiller, requireOrgId } from "@/lib/org";
import { ProductGrid } from "./product-grid";
import { isRecent } from "@/lib/unassigned";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.products.title };
}

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ business?: string }> }) {
  await denyFiller();
  const { business } = await searchParams;
  const { m } = await getI18n();
  const orgId = await requireOrgId();
  const [products, unassigned, businesses, presets, producers] = await Promise.all([
    getProducts(orgId, { includeArchived: true }),
    getUnassigned(orgId),
    getBusinesses(orgId),
    getShelfLifePresets(orgId),
    getProducers(orgId),
  ]);

  // The same count as on the overview: what sold lately and still has no product.
  const recent = unassigned.filter((g) => isRecent(g));

  return (
    <ProductGrid
      title={m.products.title}
      backHref="/machines"
      backLabel={m.nav.machines}
      notice={
        recent.length > 0 && (
          <RowList className="mb-6">
            <li>
              <ListRow
                href="/unassigned"
                leading={
                  <Avatar tone="warning">
                    <Link2 />
                  </Avatar>
                }
                title={
                  <span className="whitespace-normal font-medium">
                    {plural(recent.length, m.overview.unassignedOne, m.overview.unassigned)}
                  </span>
                }
                chevron
              />
            </li>
          </RowList>
        )
      }
      products={products}
      businesses={businesses.map((b) => ({ id: b.id, name: b.name }))}
      initialBusiness={businesses.some((b) => b.id === business) ? business : ""}
      presets={presets}
      producers={producers.map((p) => ({ id: p.id, name: p.name }))}
    />
  );
}
