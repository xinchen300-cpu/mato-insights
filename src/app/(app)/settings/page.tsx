import { headers } from "next/headers";
import { CalendarClock, ChevronDown, CircleAlert, Clock, KeyRound, LayoutTemplate, Nfc, PlugZap, Store, Trash2, Users } from "lucide-react";
import { Avatar, ListRow, RowList, initial } from "@/components/list-row";
import { PageHeader, Section } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { fmt, plural } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { getBusinesses, getLayoutTemplates, getMachines, getShelfLifePresets, getTeam } from "@/lib/data";
import { mediaUrl } from "@/lib/media";
import { billingAllows, getBilling, paymentsEnabled } from "@/lib/billing";
import { denyFiller, getCurrentOrgId, isOperator } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PayterForm } from "./payter-form";
import { deleteTemplate } from "./actions";
import { CostForm } from "./cost-form";
import { NotifyToggle } from "./notify-toggle";
import { ShelfLifePresets } from "./shelf-life-presets";
import { SubscriptionPanel } from "./subscription-panel";
import { TeamPanel } from "./team-panel";
import { AccountKind } from "./account-kind";
import { LanguageToggle } from "@/components/shell/language-toggle";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.settings.title };
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ betaald?: string }> }) {
  await denyFiller();
  const { m, f } = await getI18n();
  const orgId = await getCurrentOrgId();
  const operator = await isOperator();
  const admin = createAdminClient();

  // Everything in one go, each loader with its own checks: one row of the
  // organisation for all its settings, and for the operator the subscription
  // and who is in the team (the operator's to see and change). The vendor has
  // no subscription; it is read alongside and simply not shown. Of the syncs
  // only the last failure matters: Payter is asked every 15 seconds anyway.
  const [{ data: org }, { data: credentials }, { data: lastError }, templates, businesses, machines, presets, ownBilling, team] =
    orgId
      ? await Promise.all([
          admin
            .from("organizations")
            .select("is_vendor, is_demo, cost_per_hour, cost_per_km, first_charge_on, rents_to_businesses")
            .eq("id", orgId)
            .maybeSingle(),
          admin.from("payter_credentials").select("last_synced_at").eq("org_id", orgId).maybeSingle(),
          admin
            .from("sync_logs")
            .select("started_at, error")
            .eq("org_id", orgId)
            .eq("status", "error")
            .order("started_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          getLayoutTemplates(orgId),
          getBusinesses(orgId),
          getMachines(orgId),
          getShelfLifePresets(orgId),
          operator ? getBilling(orgId) : Promise.resolve(null),
          operator ? getTeam(orgId) : Promise.resolve(null),
        ])
      : [{ data: null }, { data: null }, { data: null }, [], [], [], [], null, null];
  const vendor = org;

  const ownTemplates = templates.filter((t) => t.org_id);

  // The subscription is the operator's business, and the vendor has none.
  const billing = orgId && !vendor?.is_vendor && operator ? ownBilling : null;
  const chargeRow = billing ? org : null;
  // The machines that count for the package: an operator's own list is exactly
  // those (in this organisation, not left out of the sync).
  const linked = billing ? machines.length : 0;

  // Renting machines or slots to businesses is in Automatenshop only: without
  // it the choice is not offered, unless the account rents already (then it
  // can still be switched off).
  const rents = Boolean(org?.rents_to_businesses);
  const canRent = Boolean(ownBilling && billingAllows(ownBilling, Boolean(org?.is_demo), "shareWithShops"));

  const payterConnected = Boolean(credentials || vendor?.is_demo);
  // Red only while the last failure is newer than the last sync that worked.
  const syncFailing =
    Boolean(lastError) && (!credentials?.last_synced_at || lastError!.started_at > credentials.last_synced_at);
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const signupUrl = `${requestHeaders.get("x-forwarded-proto") ?? "https"}://${host}/signup`;

  // Businesses and customers are one row each: their lists live on their own pages.
  const showBusinesses = rents;
  const showCustomers = operator && Boolean(vendor?.is_vendor);
  const onlyBusiness = businesses.length === 1 ? businesses[0] : null;

  return (
    <div className="max-w-2xl">
      <PageHeader title={m.settings.title} actions={<LanguageToggle />} />

      {/* What you need most often first, what you rarely change last. */}
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

        {team && (
          <TeamPanel members={team.members} invites={team.invites} youId={user?.id ?? null} signupUrl={signupUrl} />
        )}

        {/* Payter, the run cost, shelf lives and templates are the operator's:
            a shop's login sees its language, its notifications and its own
            business here, nothing of the fleet. */}
        {operator && (
          <Section title={m.settings.payter}>
            <div className="surface-card flex flex-col p-2">
              {/* The connection itself, the way a bank shows a linked account. */}
              <div className="flex min-h-16 items-center gap-3.5 rounded-xl px-3 py-3">
                <Avatar tone={payterConnected ? "positive" : "neutral"}>
                  <PlugZap />
                </Avatar>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold tracking-[-0.01em]">
                    {payterConnected ? m.settings.connected : m.settings.notConnected}
                  </p>
                  {vendor?.is_demo && !credentials ? (
                    <p className="mt-0.5 max-w-[60ch] text-[13px] leading-relaxed text-muted-foreground">{m.settings.demoNote}</p>
                  ) : credentials ? (
                    <p className="mt-0.5 text-[13px] text-muted-foreground">
                      {fmt(m.settings.lastUpdate, {
                        time: credentials.last_synced_at ? f.relative(credentials.last_synced_at) : m.settings.never,
                      })}
                    </p>
                  ) : null}
                </div>
              </div>

              {/* Only a failure gets a row: Payter refused the login, or did not answer. */}
              {credentials && syncFailing && (
                <div className="flex min-h-16 items-center gap-3.5 rounded-xl px-3 py-3">
                  <Avatar tone="negative">
                    <CircleAlert />
                  </Avatar>
                  <p className="min-w-0 flex-1 text-[14.5px] font-medium text-negative">
                    {/login|401|403/i.test(lastError?.error ?? "") ? m.settings.payterFailed : m.settings.payterUnreachable}
                  </p>
                </div>
              )}

              {credentials && (
                <>
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
                  <Fold icon={<KeyRound />} title={m.settings.reconnect}>
                    <div className="px-3 pb-3 sm:pl-[66px]">
                      <PayterForm submitLabel={m.common.save} />
                    </div>
                  </Fold>
                </>
              )}

              {!credentials && !vendor?.is_demo && (
                <div className="px-3 pb-4 pt-2">
                  <PayterForm submitLabel={m.settings.connect} />
                </div>
              )}
            </div>
          </Section>
        )}

        <Section title={m.settings.notifyTitle} hint={m.settings.notifyHint}>
          <div className="surface-card p-2">
            {process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ? (
              <NotifyToggle publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY} />
            ) : (
              <p className="px-3 py-3 text-[14px] text-muted-foreground">{m.settings.notifyUnsupported}</p>
            )}
          </div>
        </Section>

        {/* The refill settings, each one row with its value; tap to change it. */}
        {operator && (
          <Section title={m.nav.refill}>
            <div className="surface-card flex flex-col p-2">
              <Fold
                icon={<Clock />}
                title={m.settings.costTitle}
                value={fmt(m.settings.costValue, {
                  hour: f.euro(Number(org?.cost_per_hour ?? 25)),
                  km: f.euro(Number(org?.cost_per_km ?? 0.42)),
                })}
              >
                <p className="px-3 pb-1 text-[13px] leading-snug text-muted-foreground sm:pl-[66px]">{m.settings.costHint}</p>
                <CostForm perHour={Number(org?.cost_per_hour ?? 25)} perKm={Number(org?.cost_per_km ?? 0.42)} bare />
              </Fold>
              <Fold
                icon={<CalendarClock />}
                title={m.settings.shelfLifeTitle}
                value={
                  presets.length === 0
                    ? m.settings.presetNone
                    : plural(presets.length, m.settings.presetCountOne, m.settings.presetCount)
                }
              >
                <p className="px-3 pb-1 text-[13px] leading-snug text-muted-foreground sm:pl-[66px]">{m.settings.shelfLifeHint}</p>
                <ShelfLifePresets presets={presets} bare />
              </Fold>
              <Fold
                icon={<LayoutTemplate />}
                title={m.settings.templates}
                value={
                  ownTemplates.length === 0
                    ? m.settings.templatesNone
                    : plural(ownTemplates.length, m.settings.templatesCountOne, m.settings.templatesCount)
                }
              >
                {ownTemplates.length === 0 ? (
                  <p className="px-3 pb-3 text-[14px] text-muted-foreground sm:pl-[66px]">{m.settings.templatesEmpty}</p>
                ) : (
                  <ul className="flex flex-col">
                    {ownTemplates.map((t) => (
                      <li key={t.id} className="flex min-h-14 items-center gap-3.5 rounded-xl px-3 py-2 sm:pl-[66px]">
                        <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{t.name}</span>
                        <form action={deleteTemplate.bind(null, t.id)}>
                          <Button type="submit" variant="ghost" size="icon" aria-label={m.settings.deleteTemplate}>
                            <Trash2 />
                          </Button>
                        </form>
                      </li>
                    ))}
                  </ul>
                )}
              </Fold>
            </div>
          </Section>
        )}

        {/* Businesses are an automatenshop's; a zaak runs its own machines. */}
        {(showBusinesses || showCustomers) && (
          <Section
            title={
              showBusinesses && showCustomers
                ? m.settings.businessesAndCustomers
                : showBusinesses
                  ? m.businesses.title
                  : m.customers.title
            }
          >
            <RowList>
              {showBusinesses && (
                <li>
                  {onlyBusiness ? (
                    // One business (a shop's own, or the first one): straight to it.
                    <ListRow
                      href={`/businesses/${onlyBusiness.id}`}
                      leading={
                        onlyBusiness.logo_path ? (
                          <Avatar className="bg-card ring-1 ring-border">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={mediaUrl(onlyBusiness.logo_path)!} alt="" className="size-7 object-contain" />
                          </Avatar>
                        ) : (
                          <Avatar>{initial(onlyBusiness.name)}</Avatar>
                        )
                      }
                      title={onlyBusiness.name}
                      chevron
                    />
                  ) : (
                    <ListRow
                      href="/businesses"
                      leading={
                        <Avatar>
                          <Store />
                        </Avatar>
                      }
                      title={m.businesses.title}
                      subtitle={
                        businesses.length === 0 ? m.businesses.empty : plural(businesses.length, m.settings.businessCountOne, m.settings.businessCount)
                      }
                      chevron
                    />
                  )}
                </li>
              )}
              {showCustomers && (
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
              )}
            </RowList>
          </Section>
        )}

        {operator && orgId && (canRent || rents) && (
          <Section title={m.settings.kindTitle}>
            <AccountKind rents={rents} />
          </Section>
        )}
      </div>
    </div>
  );
}

/**
 * One setting as a row: what it is, its value under it, and a tap opens it.
 * Folded, so the page reads as a short list instead of a stack of forms.
 */
function Fold({
  icon,
  title,
  value,
  children,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  value?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <details className="group">
      <summary className="hover-surface flex min-h-16 cursor-pointer list-none items-center gap-3.5 rounded-xl px-3 py-3 [&::-webkit-details-marker]:hidden">
        <Avatar>{icon}</Avatar>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold tracking-[-0.01em]">{title}</span>
          {value && <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{value}</span>}
        </span>
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground/70 transition-transform duration-150 group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="pb-1 pt-1">{children}</div>
    </details>
  );
}
