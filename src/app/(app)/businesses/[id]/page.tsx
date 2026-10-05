import Link from "next/link";
import { notFound } from "next/navigation";
import { BarChart3, ChevronRight, Package } from "lucide-react";
import { PageHeader, Panel } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { fmt, plural } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { businessMachineIds, getBusiness, getMachines, getProducts } from "@/lib/data";
import { mediaUrl } from "@/lib/media";
import { requireOrgId, isOperator } from "@/lib/org";
import { BusinessSettings, MachineStarts } from "./business-settings";
import { ShareLink } from "./share-link";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orgId = await requireOrgId();
  const business = await getBusiness(orgId, id);
  return { title: business?.name };
}

export default async function BusinessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { m, f } = await getI18n();
  const orgId = await requireOrgId();

  const [business, machines, products] = await Promise.all([
    getBusiness(orgId, id),
    getMachines(orgId),
    getProducts(orgId),
  ]);
  if (!business) notFound();

  // Machines it sells from, including one it shares with another business.
  const machineIds = businessMachineIds(machines).get(business.id) ?? new Set<string>();
  const own = machines.filter((mc) => machineIds.has(mc.id));
  const productCount = products.filter((p) => p.business_id === business.id).length;

  return (
    <>
      <PageHeader
        backHref="/businesses"
        backLabel={m.businesses.title}
        title={
          <span className="flex items-center gap-3">
            {business.logo_path && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaUrl(business.logo_path)!} alt="" className="h-10 w-14 object-contain" />
            )}
            {business.name}
          </span>
        }
        subtitle={business.started_on ? fmt(m.businesses.since, { date: f.date(business.started_on) }) : undefined}
        actions={
          <Link href={`/statistics?business=${business.id}`} className={buttonVariants({ variant: "outline" })}>
            <BarChart3 />
            {m.businesses.viewStats}
          </Link>
        }
      />

      <div className="grid max-w-3xl gap-6">
        <Panel title={m.businesses.details}>
          <BusinessSettings
            business={business}
            canDelete={own.length === 0}
          />
        </Panel>

        <Panel title={m.businesses.shareTitle} hint={m.businesses.shareHint}>
          <ShareLink businessId={business.id} token={business.share_token} operator={await isOperator()} />
        </Panel>

        <Panel title={m.businesses.machinesTitle} hint={m.machines.dataSinceHint}>
          <MachineStarts machines={own} business={business} />
          <Link
            href={`/products?business=${business.id}`}
            className="group mt-2 flex items-center gap-3 border-t pt-4 text-sm font-semibold hover:text-primary"
          >
            <Package className="size-4 text-muted-foreground" />
            {plural(productCount, m.businesses.productsOne, m.businesses.productsOther)}
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        </Panel>
      </div>
    </>
  );
}
