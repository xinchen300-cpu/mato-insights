import Link from "next/link";
import { notFound } from "next/navigation";
import { BarChart3, Package } from "lucide-react";
import { Avatar, ListRow, RowList, initial } from "@/components/list-row";
import { PageHeader, Section } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { fmt, plural } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { businessMachineIds, getBusiness, getMachines, getProducts } from "@/lib/data";
import { mediaUrl } from "@/lib/media";
import { denyFiller, isOperator, requireOrgId } from "@/lib/org";
import { BusinessSettings, MachineStarts } from "./business-settings";
import { ShareLink } from "./share-link";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  await denyFiller();
  const { id } = await params;
  const orgId = await requireOrgId();
  const business = await getBusiness(orgId, id);
  return { title: business?.name };
}

export default async function BusinessPage({ params }: { params: Promise<{ id: string }> }) {
  await denyFiller();
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

  // A profile: who it is on top, then where it sells, its own page, and the
  // particulars last — those are set once and rarely looked at again.
  return (
    <div className="max-w-3xl">
      <PageHeader
        backHref="/businesses"
        backLabel={m.businesses.title}
        eyebrow={
          business.logo_path ? (
            <Avatar className="mb-2 size-16 bg-card ring-1 ring-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl(business.logo_path)!} alt="" className="size-11 object-contain" />
            </Avatar>
          ) : (
            <Avatar tone="gold" className="mb-2 size-16 text-[24px]">
              {initial(business.name)}
            </Avatar>
          )
        }
        title={business.name}
        subtitle={business.started_on ? fmt(m.businesses.since, { date: f.date(business.started_on) }) : undefined}
        actions={
          <Link href={`/statistics?business=${business.id}`} className={buttonVariants({ variant: "outline" })}>
            <BarChart3 />
            {m.businesses.viewStats}
          </Link>
        }
      />

      <div className="flex flex-col gap-10">
        <Section title={m.businesses.machinesTitle} hint={m.machines.dataSinceHint}>
          <MachineStarts machines={own} business={business} />
          <RowList>
            <li>
              <ListRow
                href={`/products?business=${business.id}`}
                leading={
                  <Avatar>
                    <Package />
                  </Avatar>
                }
                title={plural(productCount, m.businesses.productsOne, m.businesses.productsOther)}
                chevron
              />
            </li>
          </RowList>
        </Section>

        <Section title={m.businesses.shareTitle} hint={m.businesses.shareHint}>
          <div className="surface-card p-5 sm:p-6">
            <ShareLink businessId={business.id} token={business.share_token} operator={await isOperator()} />
          </div>
        </Section>

        <Section title={m.businesses.details}>
          <div className="surface-card p-5 sm:p-6">
            <BusinessSettings business={business} canDelete={own.length === 0} />
          </div>
        </Section>
      </div>
    </div>
  );
}
