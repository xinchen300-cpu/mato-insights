import { redirect } from "next/navigation";
import { getI18n } from "@/i18n/server";
import { getCurrentOrgId, isOperator } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";
import { Wizard } from "./wizard";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.welcome.helloTitle, robots: { index: false, follow: false } };
}

export default async function WelcomePage() {
  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/login");
  // Setting up the fleet is the operator's job; a shop account has no business here.
  if (!(await isOperator())) redirect("/");

  const admin = createAdminClient();
  const [{ data: org }, { data: credentials }, { data: machines }] = await Promise.all([
    admin.from("organizations").select("plan, onboarded_at").eq("id", orgId).maybeSingle(),
    admin.from("payter_credentials").select("org_id").eq("org_id", orgId).maybeSingle(),
    admin.from("machines").select("payter_serial_number, name, excluded").eq("org_id", orgId),
  ]);

  return (
    <Wizard
      payterConnected={Boolean(credentials)}
      chosenPlan={org?.plan ?? null}
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
