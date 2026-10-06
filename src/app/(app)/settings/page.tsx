import Link from "next/link";
import { ChevronRight, Store, Trash2, Users } from "lucide-react";
import { PageHeader, Panel } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmt, plural } from "@/i18n/format";
import type { Messages } from "@/i18n/messages";
import { getI18n } from "@/i18n/server";
import {
  businessMachineIds,
  getBusinesses,
  getLayoutTemplates,
  getMachines,
  getShelfLifePresets,
} from "@/lib/data";
import { mediaUrl } from "@/lib/media";
import { getBilling, linkedMachineCount, paymentsEnabled } from "@/lib/billing";
import { getCurrentOrgId, isOperator } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";
import { connectPayter, deleteTemplate } from "./actions";
import { CostForm } from "./cost-form";
import { NotifyToggle } from "./notify-toggle";
import { ShelfLifePresets } from "./shelf-life-presets";
import { SubscriptionPanel } from "./subscription-panel";
import { SyncNowButton } from "./sync-now-button";
import { LanguageToggle } from "@/components/shell/language-toggle";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.settings.title };
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ betaald?: string }> }) {
  const { m, f } = await getI18n();
  const orgId = await getCurrentOrgId();
  const admin = createAdminClient();

  const { data: vendor } = orgId
    ? await admin.from("organizations").select("is_vendor").eq("id", orgId).maybeSingle()
    : { data: null };

  const [{ data: credentials }, { data: syncLogs }, templates, businesses, machines, presets, { data: org }] = orgId
    ? await Promise.all([
        admin.from("payter_credentials").select("last_synced_at").eq("org_id", orgId).maybeSingle(),
        admin
          .from("sync_logs")
          .select("started_at, status, transactions_synced, error")
          .eq("org_id", orgId)
          .order("started_at", { ascending: false })
          .limit(6),
        getLayoutTemplates(orgId),
        getBusinesses(orgId),
        getMachines(orgId),
        getShelfLifePresets(orgId),
        admin.from("organizations").select("cost_per_hour, cost_per_km").eq("id", orgId).maybeSingle(),
      ])
    : [{ data: null }, { data: [] }, [], [], [], [], { data: null }];
  const machineIds = businessMachineIds(machines);

  const ownTemplates = templates.filter((t) => t.org_id);

  // The subscription is the operator's business, and the vendor has none.
  const operator = await isOperator();
  const billing = orgId && !vendor?.is_vendor && operator ? await getBilling(orgId) : null;
  const { data: chargeRow } = billing && orgId
    ? await admin.from("organizations").select("first_charge_on").eq("id", orgId).maybeSingle()
    : { data: null };
  const linked = billing && orgId ? await linkedMachineCount(orgId) : 0;

  return (
    <>
      <PageHeader title={m.settings.title} actions={<LanguageToggle />} />

      <div className="grid max-w-3xl gap-6">
        {billing && (
          <SubscriptionPanel
            planId={billing.plan?.id ?? null}
            status={billing.status}
            trialEndsAt={billing.trialEndsAt}
            firstChargeOn={(chargeRow?.first_charge_on as string | null) ?? null}
            paymentsEnabled={paymentsEnabled()}
            hasMandate={billing.hasMandate}
            machines={linked}
            returnedFromPayment={(await searchParams).betaald === "1"}
          />
        )}

        {vendor?.is_vendor && (
          <Panel title={m.customers.title} hint={m.customers.subtitle}>
            <Link href="/klanten" className={buttonVariants({ variant: "outline" })}>
              <Users />
              {m.customers.listTitle}
            </Link>
          </Panel>
        )}

        <Panel
          title={m.settings.payter}
          hint={m.settings.payterHint}
          actions={
            credentials ? (
              <Badge className="bg-positive/15 text-positive">{m.settings.connected}</Badge>
            ) : (
              <Badge variant="outline">{m.settings.notConnected}</Badge>
            )
          }
        >
          {credentials ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                {fmt(m.settings.lastUpdate, {
                  time: credentials.last_synced_at ? f.relative(credentials.last_synced_at) : m.settings.never,
                })}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <SyncNowButton />
                {operator && (
                  <Link href="/terminals" className={buttonVariants({ variant: "outline", size: "sm" })}>
                    {m.terminals.title}
                  </Link>
                )}
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer font-semibold text-muted-foreground">
                  {m.settings.reconnect}
                </summary>
                <PayterForm m={m} submitLabel={m.common.save} />
              </details>
            </div>
          ) : (
            <PayterForm m={m} submitLabel={m.settings.connect} />
          )}
        </Panel>

        <Panel
          title={m.businesses.title}
          hint={m.settings.businessesHint}
          actions={
            <Link href="/businesses" className={buttonVariants({ variant: "outline", size: "sm" })}>
              {m.settings.allBusinesses}
            </Link>
          }
        >
          {businesses.length === 0 ? (
            <p className="text-sm text-muted-foreground">{m.businesses.empty}</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {businesses.map((b) => {
                const count = machineIds.get(b.id)?.size ?? 0;
                return (
                  <li key={b.id}>
                    <Link href={`/businesses/${b.id}`} className="group flex items-center gap-3 py-3">
                      <span className="grid size-10 shrink-0 place-items-center bg-surface">
                        {b.logo_path ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={mediaUrl(b.logo_path)!} alt="" className="max-h-8 max-w-8 object-contain" />
                        ) : (
                          <Store className="size-4 text-muted-foreground/60" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold group-hover:text-primary">{b.name}</span>
                        <span className="block truncate text-sm text-muted-foreground">
                          {plural(count, m.businesses.machinesOne, m.businesses.machinesOther)}
                          {b.started_on && ` · ${fmt(m.businesses.since, { date: f.date(b.started_on) })}`}
                        </span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title={m.settings.notifyTitle} hint={m.settings.notifyHint}>
          {process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ? (
            <NotifyToggle publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY} />
          ) : (
            <p className="text-sm text-muted-foreground">{m.settings.notifyUnsupported}</p>
          )}
        </Panel>

        <Panel title={m.settings.costTitle} hint={m.settings.costHint}>
          <CostForm perHour={Number(org?.cost_per_hour ?? 25)} perKm={Number(org?.cost_per_km ?? 0.42)} />
        </Panel>

        <Panel title={m.settings.shelfLifeTitle} hint={m.settings.shelfLifeHint}>
          <ShelfLifePresets presets={presets} />
        </Panel>

        <Panel title={m.settings.recentSyncs}>
          {!syncLogs || syncLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{m.settings.noSyncs}</p>
          ) : (
            <ul className="flex flex-col divide-y text-sm">
              {syncLogs.map((log, i) => (
                <li key={i} className="flex items-center justify-between gap-4 py-2.5">
                  <span className="tabular">{f.dateTime(log.started_at)}</span>
                  <span className={log.status === "error" ? "text-negative" : "text-muted-foreground"}>
                    {log.status === "error"
                      ? fmt(m.settings.syncError, { error: log.error ?? "" })
                      : fmt(m.settings.synced, { count: log.transactions_synced })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={m.settings.templates}>
          {ownTemplates.length === 0 ? (
            <p className="text-sm text-muted-foreground">{m.settings.templatesEmpty}</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {ownTemplates.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-4 py-2.5">
                  <span className="font-semibold">{t.name}</span>
                  <form action={deleteTemplate.bind(null, t.id)}>
                    <Button type="submit" variant="ghost" size="icon-sm" aria-label={m.settings.deleteTemplate}>
                      <Trash2 />
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}

function PayterForm({ m, submitLabel }: { m: Messages; submitLabel: string }) {
  return (
    <form action={connectPayter} className="mt-4 grid max-w-md gap-4">
      <div className="grid gap-2">
        <Label htmlFor="username">{m.settings.username}</Label>
        <Input id="username" name="username" required autoComplete="off" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">{m.settings.password}</Label>
        <Input id="password" name="password" type="password" required autoComplete="off" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="domain">{m.settings.domain}</Label>
        <Input id="domain" name="domain" required autoComplete="off" />
      </div>
      <Button type="submit" className="w-fit">
        {submitLabel}
      </Button>
    </form>
  );
}
