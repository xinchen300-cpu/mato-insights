import { EmptyState, PageHeader } from "@/components/page-header";
import { getI18n } from "@/i18n/server";
import { getExpiryAlerts, getSlowMovers } from "@/lib/data";
import { requireOrgId } from "@/lib/org";
import { ExpiryList } from "./expiry-list";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.expiry.title };
}

export default async function ExpiryPage() {
  const { m } = await getI18n();
  const orgId = await requireOrgId();
  const [alerts, slowMovers] = await Promise.all([getExpiryAlerts(orgId), getSlowMovers(orgId)]);

  return (
    <>
      <PageHeader title={m.expiry.title} subtitle={m.expiry.subtitle} backHref="/" backLabel={m.nav.overview} />
      {alerts.length === 0 && slowMovers.filter((s) => s.always_expires).length === 0 ? (
        <EmptyState title={m.expiry.empty} hint={m.expiry.emptyHint} />
      ) : (
        <ExpiryList alerts={alerts} slowMovers={slowMovers.filter((s) => s.always_expires)} />
      )}
    </>
  );
}
