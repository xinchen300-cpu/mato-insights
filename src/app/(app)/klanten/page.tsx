import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { Avatar, RowList, initial } from "@/components/list-row";
import { PageHeader, Section } from "@/components/page-header";
import { fmt } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { denyFiller, isOperator, requireOrgId } from "@/lib/org";
import { planById } from "@/lib/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";
import { CustomerForm } from "./customer-form";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.customers.title };
}

export default async function CustomersPage() {
  await denyFiller();
  const { m, f } = await getI18n();
  const orgId = await requireOrgId();
  const admin = createAdminClient();

  // Only the organisation that sells the app has customers; for everyone else
  // this page does not exist, rather than existing and refusing.
  const { data: me } = await admin.from("organizations").select("is_vendor").eq("id", orgId).maybeSingle();
  if (!me?.is_vendor || !(await isOperator())) notFound();

  const [{ data: orgs }, { data: invites }, { data: machines }] = await Promise.all([
    admin
      .from("organizations")
      .select("id, name, plan, created_at, onboarded_at, trial_ends_at, cancelled_at, mollie_subscription_id")
      .eq("is_vendor", false)
      .order("created_at"),
    // The customer's own invitation, the owner's: not a filler or manager they invited later.
    admin.from("allowed_emails").select("email, org_id, claimed_at").eq("role", "owner"),
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
      trialEndsAt: org.trial_ends_at as string | null,
      cancelled: Boolean(org.cancelled_at),
      subscribed: Boolean(org.mollie_subscription_id),
      since: org.created_at as string,
    };
  });

  return (
    <div className="max-w-3xl">
      <PageHeader title={m.customers.title} subtitle={m.customers.subtitle} />

      <div className="flex flex-col gap-9 sm:gap-10">
        <CustomerForm signupUrl={signupUrl} />

        <Section title={m.customers.listTitle}>
          {customers.length === 0 ? (
            <p className="surface-card px-5 py-4 text-[14px] text-muted-foreground">{m.customers.listEmpty}</p>
          ) : (
            <RowList>
              {customers.map((c) => (
                // A customer as a bank shows a payee: who, how to reach them, what they
                // have; whether they are in yet as a dot and a word. On a phone that
                // word drops under the rest.
                <li
                  key={c.id}
                  className="flex flex-col gap-2 rounded-xl px-3 py-3.5 sm:flex-row sm:items-center sm:gap-4"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-3.5">
                    <Avatar>{initial(c.name)}</Avatar>
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold tracking-[-0.01em]">{c.name}</span>
                      <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                        {c.email ? fmt(m.customers.invitedTo, { email: c.email }) : f.date(c.since)}
                      </span>
                      <span className="figure mt-0.5 block text-[13px] text-muted-foreground">
                        {fmt(c.machines === 1 ? m.customers.machinesCountOne : m.customers.machinesCount, { count: c.machines })}
                        {" · "}
                        {c.plan ? `${m.plans[c.plan.id]} · ${f.euroRound(c.plan.pricePerMonth)}` : m.customers.noPlan}
                        {c.plan && c.cancelled && ` · ${m.billing.statusCancelled}`}
                        {c.plan && !c.cancelled && c.trialEndsAt && new Date(c.trialEndsAt) > new Date() &&
                          ` · ${fmt(m.billing.statusTrial, { date: f.date(c.trialEndsAt) })}`}
                        {c.plan && !c.cancelled && c.trialEndsAt && new Date(c.trialEndsAt) <= new Date() &&
                          !c.subscribed &&
                          ` · ${m.billing.statusEnded}`}
                      </span>
                    </span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1.5 pl-[54px] text-[13px] font-medium sm:pl-0">
                    <span
                      className={cn("size-1.5 rounded-full", c.registered ? "bg-positive" : "bg-muted-foreground/40")}
                      aria-hidden="true"
                    />
                    <span className={c.registered ? "text-foreground" : "text-muted-foreground"}>
                      {c.registered ? m.customers.statusActive : m.customers.statusWaiting}
                    </span>
                  </span>
                </li>
              ))}
            </RowList>
          )}
        </Section>
      </div>
    </div>
  );
}
