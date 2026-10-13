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
  // Terminals parked until now and claimed in this save: their sales were skipped while parked.
  const claimed: string[] = [];

  for (const choice of choices.slice(0, 200)) {
    const serial = String(choice.serial ?? "").trim();
    if (!serial) continue;
    const name = String(choice.name ?? "").trim().slice(0, 80) || serial;

    const { data: existing } = await admin
      .from("machines")
      .select("id, excluded")
      .eq("org_id", orgId)
      .eq("payter_serial_number", serial)
      .maybeSingle();

    if (existing) {
      if (existing.excluded && choice.mine) claimed.push(existing.id as string);
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

  if (claimed.length) await fetchSkippedSales(orgId, claimed);
  const plan = await followPackage(orgId);
  revalidatePath("/", "layout");
  return { plan };
}

/**
 * A parked terminal's sales are skipped by the sync, and it never goes back for
 * them: it only reads on from where it was. When such a terminal is claimed,
 * wind the sync back to that terminal's last imported sale (or to the start, if
 * it has none), so what it sold while parked comes in on the next runs. Sales
 * are upserted on their Payter id, so nothing arrives twice.
 */
async function fetchSkippedSales(orgId: string, machineIds: string[]) {
  const admin = createAdminClient();
  const { data: credentials } = await admin
    .from("payter_credentials")
    .select("last_watermark")
    .eq("org_id", orgId)
    .maybeSingle();
  if (!credentials) return;

  let from = Number(credentials.last_watermark ?? 0);
  for (const machineId of machineIds) {
    const { data: last } = await admin
      .from("transactions")
      .select("occurred_at")
      .eq("org_id", orgId)
      .eq("machine_id", machineId)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    // A sale is taken in after it happened, so anything after this moment is read again.
    from = Math.min(from, last ? new Date(last.occurred_at as string).getTime() : 0);
  }
  if (from < Number(credentials.last_watermark ?? 0)) {
    await admin.from("payter_credentials").update({ last_watermark: from }).eq("org_id", orgId);
  }
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
