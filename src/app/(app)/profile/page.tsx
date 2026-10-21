import Link from "next/link";
import { ChevronRight, LogOut } from "lucide-react";
import { ListRow, RowList } from "@/components/list-row";
import { PageHeader, Section } from "@/components/page-header";
import { SignOutForm } from "@/components/shell/sign-out";
import { intlLocale } from "@/i18n/config";
import { DISPLAY_TIME_ZONE, fmt, plural } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { cleanLook } from "@/lib/avatar";
import { getAccountFacts, getBusiness, getMachines, getMyRounds, getProducts, getStatsReport } from "@/lib/data";
import { fillerStats } from "@/lib/filler-stats";
import { getScope, isFiller, isOperator, requireSignedIn } from "@/lib/org";
import { displayName } from "@/lib/people";
import { ProfileCard } from "./profile-card";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.profile.title };
}

/**
 * Profiel (Xin, 21-10-2026: "a category with profile, with an avatar you can edit, and some information about this
 * account"): one's avatar and name, what the account is and since when, and a few figures fit for whoever looks: money
 * for the operator and a business, pieces and a level for whoever fills.
 */
export default async function ProfilePage() {
  const user = await requireSignedIn();
  const { m, f, locale } = await getI18n();
  const { orgId, businessId, role } = await getScope();
  const [filler, operator] = await Promise.all([isFiller(), isOperator()]);
  const fills = filler || operator;

  const [facts, business, machines, products, month, rounds] = orgId
    ? await Promise.all([
        getAccountFacts(orgId),
        businessId ? getBusiness(orgId, businessId) : Promise.resolve(null),
        getMachines(orgId),
        filler ? Promise.resolve(null) : getProducts(orgId),
        filler
          ? Promise.resolve(null)
          : getStatsReport(orgId, { period: "month", from: null, to: null, businesses: null, machines: null, products: null }),
        fills ? getMyRounds(orgId).catch(() => []) : Promise.resolve([]),
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
