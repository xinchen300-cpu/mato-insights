"use server";

import { revalidatePath } from "next/cache";
import { requireOperator, requireOrgId } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";
import { getI18n } from "@/i18n/server";
import { getBilling, linkedMachineCount, paymentsEnabled } from "@/lib/billing";
import { upgradeLine } from "@/lib/billing-copy";
import { planFor, priceInclVat, type PlanId } from "@/lib/plans";

export type TerminalChoice = { serial: string; mine: boolean; name: string };

/**
 * Which terminals on the Payter account are this operator's, and what each is
 * called. A terminal left unticked keeps `excluded`, so its sales never enter
 * the figures — that is how one login can carry another business's machines
 * without mixing them in.
 */
/** Returns the package after saving, which linking more machines may have moved up. */
export async function saveTerminalChoices(choices: TerminalChoice[]): Promise<{ plan: PlanId | null }> {
  const orgId = await requireOrgId();
  // Which machines exist at all is the operator's call, never a shop's.
  await requireOperator();
  const admin = createAdminClient();

  for (const choice of choices.slice(0, 200)) {
    const serial = String(choice.serial ?? "").trim();
    if (!serial) continue;
    const name = String(choice.name ?? "").trim().slice(0, 80) || serial;

    const { data: existing } = await admin
      .from("machines")
      .select("id")
      .eq("org_id", orgId)
      .eq("payter_serial_number", serial)
      .maybeSingle();

    if (existing) {
      await admin
        .from("machines")
        .update({ name, excluded: !choice.mine })
        .eq("id", existing.id)
        .eq("org_id", orgId);
    } else if (choice.mine) {
      // Only something you claimed is worth a row of its own.
      await admin
        .from("machines")
        .insert({ org_id: orgId, name, payter_serial_number: serial, excluded: false });
    }
  }

  const plan = await followPackage(orgId);
  revalidatePath("/", "layout");
  return { plan };
}

/**
 * The package follows the machines up, never down: a machine more than the
 * package carries moves it to the next one, with the line the picker already
 * showed stored as what they saw. Going down is a choice in Settings.
 */
async function followPackage(orgId: string): Promise<PlanId | null> {
  const billing = await getBilling(orgId);
  const current = billing.plan?.id ?? null;
  if (billing.isVendor || !billing.plan || billing.cancelledAt) return current;
  const machines = await linkedMachineCount(orgId);
  const { m, f } = await getI18n();
  // The same sentence both pickers showed before Save, or nothing to do.
  const text = upgradeLine(m, f, billing.plan, machines, paymentsEnabled());
  if (!text) return current;
  const next = planFor(machines);

  const admin = createAdminClient();
  const { error } = await admin.from("organizations").update({ plan: next.id }).eq("id", orgId);
  if (error) return current;
  await admin.from("billing_consents").insert({
    org_id: orgId,
    plan: next.id,
    price_excl: next.pricePerMonth,
    price_incl: priceInclVat(next),
    trial_ends_at: billing.trialEndsAt,
    payments: paymentsEnabled(),
    text_shown: text,
  });

  // The running Mollie subscription is not touched here. The new amount may
  // only be charged after a mail that says so, at least seven days ahead;
  // supabase/functions/vendly-billing sends that mail and then patches it.
  return next.id;
}
