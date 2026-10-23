import { headers } from "next/headers";
import { getBilling, paymentsEnabled } from "@/lib/billing";
import { getMachines, getTeam } from "@/lib/data";
import { requireOperator } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";
import { SubscriptionPanel } from "./subscription-panel";
import { TeamPanel } from "./team-panel";

/**
 * Abonnement and Team, the operator's. In Profiel where one's own settings are on (Xin, 24-10-2026: "add Team there and
 * also abonnement there instead at settings tab"); the settings page shows the same two everywhere else, loaded the
 * same way. The vendor has no subscription.
 */
export async function AccountPanels({ orgId, youId, returnedFromPayment }: { orgId: string; youId: string | null; returnedFromPayment: boolean }) {
  await requireOperator();
  const [{ data: org }, billing, team, machines, requestHeaders] = await Promise.all([
    createAdminClient().from("organizations").select("is_vendor, first_charge_on").eq("id", orgId).maybeSingle(),
    getBilling(orgId),
    getTeam(orgId),
    // The machines that count for the package: an operator's own list is exactly those.
    getMachines(orgId),
    headers(),
  ]);
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const signupUrl = `${requestHeaders.get("x-forwarded-proto") ?? "https"}://${host}/signup`;

  return (
    <>
      {!org?.is_vendor && (
        <SubscriptionPanel
          planId={billing.plan?.id ?? null}
          status={billing.status}
          trialEndsAt={billing.trialEndsAt}
          firstChargeOn={(org?.first_charge_on as string | null) ?? null}
          paymentsEnabled={paymentsEnabled()}
          hasMandate={billing.hasMandate}
          machines={machines.length}
          returnedFromPayment={returnedFromPayment}
        />
      )}
      <TeamPanel members={team.members} invites={team.invites} youId={youId} signupUrl={signupUrl} />
    </>
  );
}
