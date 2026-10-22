import { after } from "next/server";
import { notFound } from "next/navigation";
import { ChevronRight, UsersRound } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page-header";
import { SegmentedLinks } from "@/components/segmented";
import { fmt } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { CameraChecks, CameraVisits } from "@/components/visitors/camera-visits";
import { getOrgName, getVisitorCameras, getVisitorsReport, getVisitorSync, visitorsRefresher } from "@/lib/data";
import { denyFiller, isOperator, requireOrgId } from "@/lib/org";
import { camerasEnabled } from "@/lib/unifi";
import { parseVisitorPeriod, VISITOR_PERIODS, type VisitorPeriod } from "@/lib/visitors";
import { RefreshVisitors } from "./refresh-button";

/** Reading UniFi after the page (or on the button) can take a few calls of a few seconds each. */
export const maxDuration = 60;

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.visitors.title };
}

/**
 * Bezoekers (22-10-2026, Xin: "track amount of people … how long they stay … how many purchases … when busiest,
 * calmest … make best use of uni protect"): per camera what UniFi Protect's own person detection saw, against the
 * Payter sales of the machines it looks at. The operator's alone, where UniFi is set up for the organisation.
 * Opening the page reads UniFi again after it (at most every 5 minutes); the button reads it now.
 */
export default async function VisitorsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  await denyFiller();
  const { m, f } = await getI18n();
  const orgId = await requireOrgId();
  if (!(await isOperator()) || !camerasEnabled(orgId)) notFound();
  const period = parseVisitorPeriod((await searchParams).period);

  const [cameras, report, sync, orgName] = await Promise.all([
    getVisitorCameras(orgId),
    getVisitorsReport(orgId, VISITOR_PERIODS[period]),
    getVisitorSync(orgId),
    getOrgName(orgId),
  ]);
  // Who may read is settled here, with the login; the reading itself needs none and runs after the page.
  const refresh = await visitorsRefresher(orgId);
  if (refresh) after(refresh);

  const lastRun = sync.map((s) => s.lastRun).filter((run): run is string => Boolean(run)).sort()[0] ?? null;
  const failed = sync.find((s) => s.lastError)?.lastError ?? null;
  const syncLine = failed
    ? failed === "busy"
      ? m.visitors.syncBusy
      : fmt(m.visitors.syncError, { error: failed.slice(0, 80) })
    : lastRun
      ? fmt(m.visitors.syncedAt, { time: f.dateTime(lastRun) })
      : m.visitors.neverSynced;
  const seenAnything = report?.cameras.some((camera) => camera.first_event) ?? false;

  return (
    <>
      <PageHeader title={m.visitors.title} subtitle={m.visitors.subtitle} backHref="/statistics" backLabel={m.stats.title} />

      <div className="flex flex-col gap-8 sm:gap-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedLinks
            items={(Object.keys(VISITOR_PERIODS) as VisitorPeriod[]).map((key) => ({
              href: `/statistics/visitors?period=${key}`,
              label: m.visitors.periods[key],
              active: key === period,
            }))}
          />
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[13px] text-muted-foreground">{syncLine}</span>
            {cameras.length > 0 && <RefreshVisitors />}
          </div>
        </div>

        {cameras.length === 0 || !report ? (
          <EmptyState title={m.visitors.noCameras} hint={m.visitors.noCamerasHint} icon={<UsersRound className="size-5" />} />
        ) : !seenAnything ? (
          <EmptyState title={m.visitors.noData} hint={m.visitors.noDataHint} icon={<UsersRound className="size-5" />} />
        ) : (
          report.cameras.map((camera) => {
            const info = cameras.find((c) => c.cameraId === camera.camera_id);
            return info ? (
              <CameraVisits key={camera.camera_id} camera={camera} info={info} report={report} period={period} orgName={orgName} i18n={{ m, f }} />
            ) : null;
          })
        )}

        {cameras.length > 0 && <CameraChecks cameras={cameras} report={report} i18n={{ m, f }} />}

        <details className="group">
          <summary className="flex h-12 cursor-pointer list-none items-center gap-1.5 px-1 text-[16px] font-semibold [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden="true" />
            {m.visitors.howTitle}
          </summary>
          <div className="surface-card flex flex-col gap-3 px-5 py-5 text-[14.5px] leading-relaxed sm:px-8">
            {[m.visitors.how1, m.visitors.how2, m.visitors.how3, m.visitors.how4, m.visitors.how5].map((line) => (
              <p key={line} className="max-w-[68ch]">
                {line}
              </p>
            ))}
          </div>
        </details>
      </div>
    </>
  );
}
