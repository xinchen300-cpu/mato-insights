import Link from "next/link";
import { ChevronDown, CircleAlert, KeyRound, LayoutTemplate, Nfc, PlugZap, RefreshCw, Trash2, Users } from "lucide-react";
import { Avatar, ListRow, RowList, initial } from "@/components/list-row";
import { PageHeader, Section } from "@/components/page-header";
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
import { cn } from "@/lib/utils";
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
    ? await admin.from("organizations").select("is_vendor, is_demo").eq("id", orgId).maybeSingle()
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

  const payterConnected = Boolean(credentials || vendor?.is_demo);

  return (
    <div className="max-w-2xl">
      <PageHeader title={m.settings.title} actions={<LanguageToggle />} />

      <div className="flex flex-col gap-9 sm:gap-10">
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
          <Section title={m.customers.title}>
            <RowList>
              <li>
                <ListRow
                  href="/klanten"
                  leading={
                    <Avatar>
                      <Users />
                    </Avatar>
                  }
                  title={m.customers.listTitle}
                  chevron
                />
              </li>
            </RowList>
          </Section>
        )}

        <Section title={m.settings.payter}>
          <div className="surface-card flex flex-col p-2">
            {/* The connection itself, the way a bank shows a linked account. */}
            <SettingRow
              leading={
                <Avatar tone={payterConnected ? "positive" : "neutral"}>
                  <PlugZap />
                </Avatar>
              }
              title={payterConnected ? m.settings.connected : m.settings.notConnected}
              subtitle={
                vendor?.is_demo && !credentials ? (
                  <span className="block max-w-[60ch] leading-relaxed">{m.settings.demoNote}</span>
                ) : credentials ? (
                  fmt(m.settings.lastUpdate, {
                    time: credentials.last_synced_at ? f.relative(credentials.last_synced_at) : m.settings.never,
                  })
                ) : undefined
              }
              control={credentials ? <SyncNowButton /> : undefined}
            />

            {credentials && (
              <>
                {operator && (
                  <ListRow
                    href="/terminals"
                    leading={
                      <Avatar>
                        <Nfc />
                      </Avatar>
                    }
                    title={<span className="whitespace-normal">{m.terminals.title}</span>}
                    chevron
                  />
                )}
                <details className="group">
                  <summary className="hover-surface flex min-h-16 cursor-pointer list-none items-center gap-3.5 rounded-xl px-3 py-3 [&::-webkit-details-marker]:hidden">
                    <Avatar>
                      <KeyRound />
                    </Avatar>
                    <span className="min-w-0 flex-1 text-[15px] font-semibold tracking-[-0.01em]">
                      {m.settings.reconnect}
                    </span>
                    <ChevronDown
                      className="size-4 shrink-0 text-muted-foreground/70 transition-transform duration-150 group-open:rotate-180"
                      aria-hidden="true"
                    />
                  </summary>
                  <div className="px-3 pb-4 pt-1 sm:pl-[66px]">
                    <PayterForm m={m} submitLabel={m.common.save} />
                  </div>
                </details>
              </>
            )}

            {!credentials && !vendor?.is_demo && (
              <div className="px-3 pb-4 pt-2">
                <PayterForm m={m} submitLabel={m.settings.connect} />
              </div>
            )}
          </div>
        </Section>

        <Section title={m.settings.recentSyncs}>
          {!syncLogs || syncLogs.length === 0 ? (
            <p className="surface-card px-5 py-4 text-[14px] text-muted-foreground">{m.settings.noSyncs}</p>
          ) : (
            <RowList>
              {syncLogs.map((log, i) => (
                <li key={i} className="flex min-h-16 items-center gap-3.5 rounded-xl px-3 py-3">
                  {log.status === "error" ? (
                    <Avatar tone="negative">
                      <CircleAlert />
                    </Avatar>
                  ) : (
                    <Avatar>
                      <RefreshCw />
                    </Avatar>
                  )}
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block break-words text-[15px] font-semibold tracking-[-0.01em]",
                        log.status === "error" && "text-negative",
                      )}
                    >
                      {log.status === "error"
                        ? fmt(m.settings.syncError, { error: log.error ?? "" })
                        : fmt(m.settings.synced, { count: log.transactions_synced })}
                    </span>
                    <span className="tabular mt-0.5 block text-[13px] text-muted-foreground">
                      {f.dateTime(log.started_at)}
                    </span>
                  </span>
                </li>
              ))}
            </RowList>
          )}
        </Section>

        <Section
          title={m.businesses.title}
          actions={
            <Link href="/businesses" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-mr-2 shrink-0")}>
              {m.settings.allBusinesses}
            </Link>
          }
        >
          {businesses.length === 0 ? (
            <p className="surface-card px-5 py-4 text-[14px] text-muted-foreground">{m.businesses.empty}</p>
          ) : (
            <RowList>
              {businesses.map((b) => {
                const count = machineIds.get(b.id)?.size ?? 0;
                return (
                  <li key={b.id}>
                    <ListRow
                      href={`/businesses/${b.id}`}
                      leading={
                        b.logo_path ? (
                          <Avatar className="bg-card ring-1 ring-border">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={mediaUrl(b.logo_path)!} alt="" className="size-7 object-contain" />
                          </Avatar>
                        ) : (
                          <Avatar>{initial(b.name)}</Avatar>
                        )
                      }
                      title={b.name}
                      subtitle={
                        <>
                          {plural(count, m.businesses.machinesOne, m.businesses.machinesOther)}
                          {b.started_on && ` · ${fmt(m.businesses.since, { date: f.date(b.started_on) })}`}
                        </>
                      }
                      chevron
                    />
                  </li>
                );
              })}
            </RowList>
          )}
        </Section>

        <Section title={m.settings.notifyTitle} hint={m.settings.notifyHint}>
          <div className="surface-card p-2">
            {process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ? (
              <NotifyToggle publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY} />
            ) : (
              <p className="px-3 py-3 text-[14px] text-muted-foreground">{m.settings.notifyUnsupported}</p>
            )}
          </div>
        </Section>

        <Section title={m.settings.costTitle} hint={m.settings.costHint}>
          <CostForm perHour={Number(org?.cost_per_hour ?? 25)} perKm={Number(org?.cost_per_km ?? 0.42)} />
        </Section>

        <Section title={m.settings.shelfLifeTitle} hint={m.settings.shelfLifeHint}>
          <ShelfLifePresets presets={presets} />
        </Section>

        <Section title={m.settings.templates}>
          {ownTemplates.length === 0 ? (
            <p className="surface-card px-5 py-4 text-[14px] text-muted-foreground">{m.settings.templatesEmpty}</p>
          ) : (
            <RowList>
              {ownTemplates.map((t) => (
                <li key={t.id} className="flex min-h-16 items-center gap-3.5 rounded-xl px-3 py-3">
                  <Avatar>
                    <LayoutTemplate />
                  </Avatar>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-[-0.01em]">{t.name}</span>
                  <form action={deleteTemplate.bind(null, t.id)}>
                    <Button type="submit" variant="ghost" size="icon" aria-label={m.settings.deleteTemplate}>
                      <Trash2 />
                    </Button>
                  </form>
                </li>
              ))}
            </RowList>
          )}
        </Section>
      </div>
    </div>
  );
}

/**
 * One setting: what it is on the left, what you can do about it on the right.
 * On a phone the control drops under the text, lined up past the token.
 */
function SettingRow({
  leading,
  title,
  subtitle,
  control,
}: {
  leading: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  control?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl px-3 py-3 sm:min-h-16 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 items-center gap-3.5">
        {leading}
        <div className="min-w-0">
          <p className="text-[15px] font-semibold tracking-[-0.01em]">{title}</p>
          {subtitle && <div className="mt-0.5 text-[13px] text-muted-foreground">{subtitle}</div>}
        </div>
      </div>
      {control && <div className="shrink-0 pl-[54px] sm:pl-0">{control}</div>}
    </div>
  );
}

function PayterForm({ m, submitLabel }: { m: Messages; submitLabel: string }) {
  return (
    <form action={connectPayter} className="grid max-w-md gap-4">
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
      <Button type="submit" className="mt-1 w-fit">
        {submitLabel}
      </Button>
    </form>
  );
}
