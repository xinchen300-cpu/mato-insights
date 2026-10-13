import { Link2 } from "lucide-react";
import { Avatar, ListRow, RowList } from "@/components/list-row";
import { fmt } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import {
  getBusinesses,
  getProducts,
  getProductSlotCounts,
  getShelfLifePresets,
  getUnassigned,
} from "@/lib/data";
import { denyFiller, requireOrgId } from "@/lib/org";
import { ProductGrid } from "./product-grid";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.products.title };
}

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ business?: string }> }) {
  await denyFiller();
  const { business } = await searchParams;
  const { m } = await getI18n();
  const orgId = await requireOrgId();
  const [products, slotCounts, unassigned, businesses, presets] = await Promise.all([
    getProducts(orgId, { includeArchived: true }),
    getProductSlotCounts(orgId),
    getUnassigned(orgId),
    getBusinesses(orgId),
    getShelfLifePresets(orgId),
  ]);

  return (
    <ProductGrid
      title={m.products.title}
      notice={
        unassigned.length > 0 && (
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
                    {fmt(m.overview.unassigned, { count: unassigned.length })}
                  </span>
                }
                chevron
              />
            </li>
          </RowList>
        )
      }
      products={products}
      slotCounts={Object.fromEntries(slotCounts)}
      businesses={businesses.map((b) => ({ id: b.id, name: b.name }))}
      initialBusiness={businesses.some((b) => b.id === business) ? business : ""}
      presets={presets}
    />
  );
}
