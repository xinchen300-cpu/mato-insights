import Link from "next/link";
import { ChevronRight, LogOut } from "lucide-react";
import { ListRow, RowList } from "@/components/list-row";
import { PageHeader, Section } from "@/components/page-header";
import { SignOutForm } from "@/components/shell/sign-out";
import { intlLocale } from "@/i18n/config";
import { DISPLAY_TIME_ZONE, fmt, plural } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import type { Messages } from "@/i18n/messages/en";
import { cleanLook } from "@/lib/avatar";
import { MachinePhoto } from "@/components/machine/machine-photo";
import { getAccountFacts, getBusiness, getMachines, getMyRounds, getProducts, getStatsReport } from "@/lib/data";
import { fillerStats } from "@/lib/filler-stats";
import { MODEL_SHEETS, asMachineModel } from "@/lib/machine-models";
import { getScope, hasPersonalSettings, isFiller, isOperator, requireSignedIn } from "@/lib/org";
import { displayName } from "@/lib/people";
import type { Machine } from "@/lib/types";
import { AccountPanels } from "../settings/account-panels";
import { ProfileCard } from "./profile-card";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.profile.title };
}

/**
 * Profiel (Xin, 21-10-2026: "a category with profile, with an avatar you can edit, and some information about this
 * account"): one's avatar and name, what the account is and since when, and a few figures fit for whoever looks: money
 * for the operator and a business, pieces and a level for whoever fills. Where one's own settings are on (24-10-2026,
 * Xin: "at profiel i want you to remove cijfers, but add Team there and also abonnement there … also add my automaat"):
 * no figures, but one's machines with their model, and the operator's subscription and team.
 */
export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ betaald?: string }> }) {
  const user = await requireSignedIn();
  const { m, f, locale } = await getI18n();
  const { orgId, businessId, role } = await getScope();
  const [filler, operator, personal] = await Promise.all([isFiller(), isOperator(), hasPersonalSettings()]);
  const fills = filler || operator;
  // The figures are only read where they are shown.
  const figures = !personal;

  const [facts, business, machines, products, month, rounds] = orgId
    ? await Promise.all([
        getAccountFacts(orgId),
        businessId ? getBusiness(orgId, businessId) : Promise.resolve(null),
        getMachines(orgId),
        filler || !figures ? Promise.resolve(null) : getProducts(orgId),
        filler || !figures
          ? Promise.resolve(null)
          : getStatsReport(orgId, { period: "month", from: null, to: null, businesses: null, machines: null, products: null }),
        fills && figures ? getMyRounds(orgId).catch(() => []) : Promise.resolve([]),
      ])
    : [null, null, [], null, null, []];
  const stats = rounds.length ? fillerStats(rounds, DISPLAY_TIME_ZONE) : null;

  const roleLabel = businessId
    ? m.team.roleMember
    : role === "owner"
      ? m.team.roleOwner
      : role === "admin"
        ? m.team.roleAdmin
        : role === "filler"
          ? m.team.roleFiller
          : null;
  const language = new Intl.DisplayNames([intlLocale[locale]], { type: "language" }).of(locale) ?? locale;
  const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

  const account: [string, string][] = [
    [m.profile.email, user.email ?? "—"],
    ...(roleLabel ? [[m.profile.role, roleLabel] as [string, string]] : []),
    ...(facts?.orgName ? [[m.profile.organisation, facts.orgName] as [string, string]] : []),
    ...(business ? [[m.profile.business, business.name] as [string, string]] : []),
    [m.profile.since, f.date(user.created_at)],
    ...(user.last_sign_in_at ? [[m.profile.lastSignIn, f.dateTime(user.last_sign_in_at)] as [string, string]] : []),
    [m.profile.language, capitalize(language)],
  ];

  return (
    <>
      <PageHeader title={m.profile.title} subtitle={m.profile.subtitle} />
      <div className="flex flex-col gap-8">
        <ProfileCard look={cleanLook(user.user_metadata?.avatar)} name={displayName(user)} email={user.email ?? null} />

        {facts?.isDemo && (
          <p className="surface-card max-w-[70ch] px-4 py-3 text-[13.5px] leading-relaxed text-muted-foreground">{m.settings.demoNote}</p>
        )}

        <Section title={m.profile.account}>
          <RowList>
            {account.map(([label, value]) => (
              <li key={label}>
                <ListRow title={value} subtitle={label} />
              </li>
            ))}
          </RowList>
        </Section>

        {/* One's machines and what model each is; a tap shows what it can do (24-10-2026). */}
        {personal && !filler && machines.length > 0 && (
          <Section title={m.machineModels.section} hint={m.machineModels.sectionHint}>
            <RowList>
              {machines.map((machine) => (
                <li key={machine.id}>
                  <ListRow
                    href={`/profile/machines/${machine.id}`}
                    leading={<MachineThumb machine={machine} />}
                    title={machine.name}
                    subtitle={kindOf(machine, m)}
                    chevron
                  />
                </li>
              ))}
            </RowList>
          </Section>
        )}

        {personal && operator && orgId && (
          <AccountPanels orgId={orgId} youId={user.id} returnedFromPayment={(await searchParams).betaald === "1"} />
        )}

        {figures && (
          <Section title={m.profile.inNumbers}>
            <RowList>
              {month && (
                <li>
                  <ListRow
                    title={m.profile.thisMonth}
                    value={f.euro(month.totals.revenue)}
                    valueSub={
                      <span className="tabular text-muted-foreground">
                        {month.totals.units === 1 ? m.common.salesOne : fmt(m.common.salesOther, { count: f.number(month.totals.units) })}
                      </span>
                    }
                  />
                </li>
              )}
              <li>
                <ListRow title={m.profile.machines} value={<span className="tabular">{f.number(machines.length)}</span>} />
              </li>
              {products && (
                <li>
                  <ListRow title={m.profile.products} value={<span className="tabular">{f.number(products.length)}</span>} />
                </li>
              )}
              {facts?.teamSize != null && (
                <li>
                  <ListRow
                    href="/settings"
                    title={m.profile.team}
                    value={<span className="tabular">{f.number(facts.teamSize)}</span>}
                    chevron
                  />
                </li>
              )}
              {fills && (
                <li>
                  <ListRow
                    href="/refill/me"
                    title={m.profile.figures}
                    subtitle={
                      stats ? (
                        <span className="tabular">{fmt(m.profile.level, { level: stats.level.level, items: f.number(stats.items) })}</span>
                      ) : undefined
                    }
                    value={stats ? <span className="tabular">{plural(stats.rounds, m.fillers.roundsOne, m.fillers.rounds)}</span> : undefined}
                    chevron
                  />
                </li>
              )}
            </RowList>
          </Section>
        )}

        <div className="flex flex-wrap gap-2">
          {!filler && (
            <Link href="/settings" className="inline-flex h-11 items-center gap-1.5 rounded-full border px-4 text-[14.5px] font-semibold hover:bg-hover/40">
              {m.profile.settings}
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
            </Link>
          )}
          <SignOutForm question={m.auth.confirmSignOut}>
            <button type="submit" className="inline-flex h-11 items-center gap-2 rounded-full border px-4 text-[14.5px] font-semibold text-destructive hover:bg-hover/40">
              <LogOut className="size-4" aria-hidden="true" />
              {m.auth.signOut}
            </button>
          </SignOutForm>
        </div>
      </div>
    </>
  );
}

/** "MATO B1 · Gekoelde liftautomaat", or the kind of machine, or that it is not set. */
function kindOf(machine: Machine, m: Messages): string {
  const model = asMachineModel(machine.model);
  if (model) return `${MODEL_SHEETS[model].name} · ${m.machineModels[model].kind}`;
  return machine.type ? m.machines.types[machine.type] : m.machineModels.notSet;
}

/** The model as on its folder, else the machine's own photo or the default machine. */
function MachineThumb({ machine }: { machine: Machine }) {
  const model = asMachineModel(machine.model);
  if (!model) return <MachinePhoto path={machine.photo_path} className="size-12 shrink-0 rounded-xl" />;
  return (
    <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-[linear-gradient(160deg,var(--photo-from),var(--photo-to))]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={MODEL_SHEETS[model].image} alt="" className="h-10 w-auto" />
    </span>
  );
}
