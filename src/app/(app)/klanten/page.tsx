import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { Building2 } from "lucide-react";
import { PageHeader, Panel } from "@/components/page-header";
import { fmt } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { isOperator, requireOrgId } from "@/lib/org";
import { planById } from "@/lib/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { CustomerForm } from "./customer-form";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.customers.title };
}

export default async function CustomersPage() {
  const { m, f } = await getI18n();
  const orgId = await requireOrgId();
  const admin = createAdminClient();

  // Only the organisation that sells the app has customers; for everyone else
  // this page does not exist, rather than existing and refusing.
  const { data: me } = await admin.from("organizations").select("is_vendor").eq("id", orgId).maybeSingle();
  if (!me?.is_vendor || !(await isOperator())) notFound();

  const [{ data: orgs }, { data: invites }, { data: machines }] = await Promise.all([
    admin.from("organizations").select("id, name, plan, created_at, onboarded_at").eq("is_vendor", false).order("created_at"),
    admin.from("allowed_emails").select("email, org_id, claimed_at"),
    admin.from("machines").select("org_id").eq("excluded", false),
  ]);

  const inviteFor = new Map((invites ?? []).map((i) => [i.org_id, i]));
  const machineCount = new Map<string, number>();
  for (const mc of machines ?? []) machineCount.set(mc.org_id, (machineCount.get(mc.org_id) ?? 0) + 1);

  const host = (await headers()).get("host") ?? "";
  const signupUrl = `https://${host}/signup`;

  const customers = (orgs ?? []).map((org) => {
    const invite = inviteFor.get(org.id);
    return {
      id: org.id,
      name: org.name as string,
      email: (invite?.email as string | undefined) ?? null,
      registered: Boolean(invite?.claimed_at),
      machines: machineCount.get(org.id) ?? 0,
      plan: planById(org.plan as string | null),
      since: org.created_at as string,
    };
  });

  return (
    <>
      <PageHeader title={m.customers.title} subtitle={m.customers.subtitle} />

      <div className="flex flex-col gap-6">
        <CustomerForm signupUrl={signupUrl} />

        <Panel title={m.customers.listTitle}>
          {customers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{m.customers.listEmpty}</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {customers.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3.5">
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 font-semibold">
                      <Building2 className="size-4 shrink-0 text-muted-foreground" />
                      {c.name}
                    </span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {c.email ? fmt(m.customers.invitedTo, { email: c.email }) : f.date(c.since)}
                    </span>
                  </span>
                  <span className="text-right text-sm">
                    <span
                      className={c.registered ? "block font-semibold text-positive" : "block text-muted-foreground"}
                    >
                      {c.registered ? m.customers.statusActive : m.customers.statusWaiting}
                    </span>
                    <span className="figure block text-xs text-muted-foreground">
                      {fmt(m.customers.machinesCount, { count: c.machines })}
                      {" · "}
                      {c.plan ? `${m.plans[c.plan.id]} · ${f.euro(c.plan.pricePerMonth)}` : m.customers.noPlan}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
