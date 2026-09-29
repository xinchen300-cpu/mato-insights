import { EmptyState, PageHeader } from "@/components/page-header";
import { getI18n } from "@/i18n/server";
import { getExpiryAlerts, getSlowMovers, getWasteReport } from "@/lib/data";
import { requireOrgId } from "@/lib/org";
import { ExpiryList } from "./expiry-list";
import { WasteList } from "./waste-list";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.expiry.title };
}

export default async function ExpiryPage() {
  const { m } = await getI18n();
  const orgId = await requireOrgId();
  const [alerts, slowMovers, waste] = await Promise.all([
    getExpiryAlerts(orgId),
    getSlowMovers(orgId),
    getWasteReport(orgId),
  ]);

  return (
    <>
      <PageHeader title={m.expiry.title} subtitle={m.expiry.subtitle} backHref="/" backLabel={m.nav.overview} />
      {alerts.length === 0 && slowMovers.filter((s) => s.always_expires).length === 0 && waste.length === 0 ? (
        <EmptyState title={m.expiry.empty} hint={m.expiry.emptyHint} />
      ) : (
        <div className="flex flex-col gap-6">
          <ExpiryList alerts={alerts} slowMovers={slowMovers.filter((s) => s.always_expires)} />
          {waste.length > 0 && <WasteList rows={waste} />}
        </div>
      )}
    </>
  );
}
