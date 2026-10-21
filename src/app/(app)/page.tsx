import Link from "next/link";
import { redirect } from "next/navigation";
import { ChefHat, ListChecks } from "lucide-react";
import { MachineRevenue } from "@/components/overview/machine-revenue";
import { OverviewCamera } from "@/components/overview/overview-camera";
import { revenueByMachine } from "@/lib/overview";
import { ownRound, startable } from "@/lib/refill-start";
import { StartRound } from "./refill/list/start-round";
import { SetupGuide } from "@/components/setup-guide";
import { EmptyState, PageHeader } from "@/components/page-header";
import { LiveRounds } from "@/components/refill/live-rounds";
import { NextRound } from "@/components/refill/next-round";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DISPLAY_TIME_ZONE, fmt } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import {
  getLastRefills,
  getLiveSales,
  getMachineCameras,
  getLastSyncedAt,
  getOpenRounds,
  getMachines,
  getMachineStock,
  getStatsReport,
  getRoundSettings,
  getSetupState,
  hasProducerDishes,
  type OpenRound,
} from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { lastFullWeeks } from "@/lib/stats";
import { denyFiller, getCurrentOrgId, isOperator } from "@/lib/org";
import { AutoRefresh } from "@/components/auto-refresh";
import { LiveSales } from "@/components/live-sales";


/** "Meer zien" under Net verkocht opens this many. */
const LIVE_ROWS = 40;
/** Payter is asked every 15 seconds; only data this old is worth a word on the page. */
const STALE_MS = 15 * 60_000;
const isStale = (syncedAt: string | null) => syncedAt !== null && Date.now() - Date.parse(syncedAt) > STALE_MS;

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.overview.title };
}

export default async function OverviewPage() {
  await denyFiller();
  const { m, f } = await getI18n();
  const orgId = await getCurrentOrgId();
  const operator = await isOperator();

  if (!orgId) {
    // Signed in but in no organisation: registered without the invitation's
    // link. Settings would be a dead end; the link is the way in.
    const {
      data: { user },
    } = await (await createClient()).auth.getUser();
    if (user) return <EmptyState title={m.overview.noOrgTitle} hint={m.overview.noOrgHint} />;
    return (
      <EmptyState
        title={m.overview.noData}
        hint={m.overview.noDataHint}
        action={
          <Link href="/settings" className={buttonVariants()}>
            {m.overview.toSettings}
          </Link>
        }
      />
    );
  }

  // Everything on the page is asked for at once, each loader with its own
  // checks, and the onboarding question below runs alongside instead of first.
  // The last whole weeks only say whether anything sold lately, for the empty page below.
  const patternWeeks = 8;
  const loads = Promise.all([
    operator ? getOpenRounds(orgId) : Promise.resolve<OpenRound[]>([]),
    getStatsReport(orgId, { period: "today" }),
    getStatsReport(orgId, { period: "week" }),
    getStatsReport(orgId, { period: "month" }),
    getStatsReport(orgId, { period: "custom", ...lastFullWeeks(patternWeeks, DISPLAY_TIME_ZONE) }),
    getMachines(orgId),
    getMachineStock(orgId),
    getLastSyncedAt(orgId),
    getSetupState(orgId),
    getLiveSales(orgId, { limit: LIVE_ROWS }),
    getLastRefills(orgId),
    hasProducerDishes(orgId),
    operator ? getRoundSettings(orgId) : Promise.resolve(null),
    // The cameras by machine, so each sale in Net verkocht opens its recording (empty for anyone but the operator).
    getMachineCameras(orgId),
  ]);
  // A redirect below leaves it unawaited: a failure in it must not go unhandled.
  loads.catch(() => undefined);

  // Wie nog nooit door de rondleiding is, hoort niet op een leeg dashboard te
  // landen. Eén keer, en daarna nooit meer. Wat al geladen werd, vervalt dan.
  let orgName: string | null = null;
  if (operator) {
    const { data: org } = await createAdminClient()
      .from("organizations")
      .select("onboarded_at, name")
      .eq("id", orgId)
      .maybeSingle();
    if (org && !org.onboarded_at) redirect("/welkom");
    orgName = (org?.name as string | null) ?? null;
  }

  const [openRounds, today, week, month, weeks, machines, stock, syncedAt, setup, recentSales, refills, kitchen, roundSettings, cameras] =
    await loads;
  // Only the rounds actually out (started), and only for the operator.
  const liveRounds = openRounds.filter((round) => round.readyAt);

  if (month.totals.units === 0 && weeks.totals.units === 0) {
    return (
      <>
        <AutoRefresh />
        <PageHeader title={m.overview.title} />
        {/* A shop has no setup of its own to finish, and /terminals is not hers. */}
        {setup.done || !operator ? (
          <EmptyState
            title={m.overview.noData}
            hint={operator ? m.overview.noDataHint : m.overview.noDataShop}
            action={
              operator && (
                <Link href="/settings" className={buttonVariants()}>
                  {m.overview.toSettings}
                </Link>
              )
            }
          />
        ) : (
          <SetupGuide setup={setup} m={m} />
        )}
      </>
    );
  }

  // Only a sync that stalled gets a word under the title.
  const stale = isStale(syncedAt);
  // Something that only began selling after the earlier period started gets
  // "new since …" instead of a percentage against a half-empty period.
  const newSince = (firstSale: string | null) =>
    firstSale ? fmt(m.stats.newSince, { date: f.dayMonth(firstSale) }) : undefined;
  // Every machine with its money for today, this week and this month (Xin,
  // 19-10-2026: per machine rather than one total), how full it is and when it
  // was last filled; all of them together is one line above.
  const revenue = revenueByMachine({ reports: { today, week, month }, machines, stock, refills, orgName, newSince });
  // What "Vul route beginnen" puts on a round, as on the filler's home.
  const roundStart = startable(machines, stock, openRounds, roundSettings?.route ?? []);
  // Their own open round holds its machines, so the start button alone would
  // vanish while it is open: the round to carry on with takes its place.
  const own = ownRound(openRounds);
  // The machines with a camera, in the order of the money above, for the camera under Net verkocht.
  const cameraMachines = revenue.machines
    .filter((mc) => cameras[mc.id]?.length)
    .map((mc) => ({
      id: mc.id,
      name: mc.name,
      cameras: cameras[mc.id].map((camera, i) => ({ id: camera.cameraId, name: camera.name ?? `${m.machines.cameraUnnamed} ${i + 1}` })),
    }));

  return (
    <>
      {/* Only while a round is out, so the filler is seen moving on; new sales come in by themselves
          (LiveSales), and a page reloading itself every half minute made everything feel slow. */}
      {liveRounds.length > 0 && <AutoRefresh every={20_000} />}
      <PageHeader
        title={m.overview.title}
        subtitle={
          stale && syncedAt ? (
            <span className="font-medium text-warning">{fmt(m.overview.updated, { time: f.relative(syncedAt) })}</span>
          ) : undefined
        }
      />

      {/* The day's buttons, then the money machine by machine and what just sold. One thing per block
          (Xin, 19-10-2026); the month's chart went (20-10-2026), "Vandaag te doen" and "Goed om te
          weten" went too (21-10-2026, Xin: "delete vandaag te doen … goed om te weten mag ook weg"). */}
      <div className="flex flex-col gap-8">
        {/* A round that is out right now comes first: who, how long, where. */}
        {liveRounds.some((round) => round.id !== own?.id) && (
          <LiveRounds rounds={liveRounds.filter((round) => round.id !== own?.id)} refresh={false} />
        )}
        {/* The owner's day in a few taps: the filler's start button (Xin, 20-10-2026), the kitchen's order, what each machine needs. */}
        {operator && (
          <div className="flex flex-col gap-3">
            {own ? (
              <NextRound round={own} m={m} />
            ) : roundStart.ids.length > 0 ? (
              <StartRound fill label={m.refill.beginFilling} machineIds={roundStart.ids} />
            ) : roundStart.busy.size > 0 ? (
              // Someone else's round holds every machine: say so, rather than nothing.
              <Link href="/refill" className="px-1 text-[14.5px] text-muted-foreground underline-offset-4 hover:underline">
                {m.refill.allOnRound}
              </Link>
            ) : null}
          <nav aria-label={m.overview.quick} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {kitchen && (
              <Link href="/refill/kitchen" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "shrink-0")}>
                <ChefHat />
                {m.kitchen.title}
              </Link>
            )}
            <Link href="/refill/list" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "shrink-0")}>
              <ListChecks />
              {m.nav.fillList}
            </Link>
          </nav>
          </div>
        )}

        <MachineRevenue machines={revenue.machines} totals={revenue.totals} />

        {/* What just sold, sliding in as it happens; "Meer zien" opens the day's list. */}
        <LiveSales initial={recentSales} cameras={cameras} />

        {/* What the camera sees now, without going to the machine (Xin, 21-10-2026). */}
        {cameraMachines.length > 0 && <OverviewCamera machines={cameraMachines} />}
      </div>
    </>
  );
}
