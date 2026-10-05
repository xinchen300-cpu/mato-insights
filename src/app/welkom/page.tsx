import { redirect } from "next/navigation";
import { getI18n } from "@/i18n/server";
import { getCurrentOrgId, isOperator } from "@/lib/org";
import { paymentsEnabled } from "@/lib/billing";
import { createAdminClient } from "@/lib/supabase/admin";
import { Wizard } from "./wizard";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.welcome.helloTitle, robots: { index: false, follow: false } };
}

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ betaald?: string }> }) {
  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/login");
  // Setting up the fleet is the operator's job; a shop account has no business here.
  if (!(await isOperator())) redirect("/");

  const admin = createAdminClient();
  const [{ data: org }, { data: credentials }, { data: machines }] = await Promise.all([
    admin.from("organizations").select("plan, onboarded_at, is_vendor, trial_ends_at").eq("id", orgId).maybeSingle(),
    admin.from("payter_credentials").select("org_id").eq("org_id", orgId).maybeSingle(),
    admin.from("machines").select("payter_serial_number, name, excluded").eq("org_id", orgId),
  ]);

  return (
    <Wizard
      payterConnected={Boolean(credentials)}
      chosenPlan={org?.plan ?? null}
      isVendor={Boolean(org?.is_vendor)}
      paymentsEnabled={paymentsEnabled()}
      trialEndsAt={(org?.trial_ends_at as string | null) ?? null}
      returnedFromPayment={(await searchParams).betaald === "1"}
      knownMachines={(machines ?? [])
        .filter((mc) => mc.payter_serial_number)
        .map((mc) => ({
          serial: mc.payter_serial_number as string,
          name: mc.name as string,
          excluded: Boolean(mc.excluded),
        }))}
    />
  );
}
