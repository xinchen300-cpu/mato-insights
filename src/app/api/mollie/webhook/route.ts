import { NextResponse, type NextRequest } from "next/server";
import { paymentsEnabled } from "@/lib/billing";
import { getPayment } from "@/lib/mollie";
import { ensureSubscription } from "@/lib/subscription";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Mollie posts only an id here and nothing else. Everything that matters is
 * fetched back from Mollie with our own key, so a forged call can at most make
 * us re-read a real payment of our own. Always answer 200 once handled:
 * anything else makes Mollie retry.
 */
export async function POST(request: NextRequest) {
  if (!paymentsEnabled()) return new NextResponse(null, { status: 200 });

  const form = await request.formData().catch(() => null);
  const id = String(form?.get("id") ?? "");
  // Subscription webhooks also arrive as payment ids (tr_...).
  if (!id.startsWith("tr_")) return new NextResponse(null, { status: 200 });

  const payment = await getPayment(id).catch(() => null);
  if (!payment) return new NextResponse(null, { status: 200 });

  const admin = createAdminClient();
  let orgId = payment.metadata?.orgId ?? null;
  // Charges made by a subscription carry the subscription's metadata on the
  // subscription, not the payment: find the organisation by customer instead.
  if (!orgId && payment.customerId) {
    const { data } = await admin
      .from("organizations")
      .select("id")
      .eq("mollie_customer_id", payment.customerId)
      .maybeSingle();
    orgId = (data?.id as string | undefined) ?? null;
  }
  if (!orgId) return new NextResponse(null, { status: 200 });

  // The customer on the payment must be this organisation's customer, or the
  // metadata is lying and nothing gets written.
  const { data: org } = await admin
    .from("organizations")
    .select("mollie_customer_id")
    .eq("id", orgId)
    .maybeSingle();
  if (!org || (payment.customerId && org.mollie_customer_id !== payment.customerId)) {
    return new NextResponse(null, { status: 200 });
  }

  await admin.from("billing_payments").upsert({
    mollie_id: payment.id,
    org_id: orgId,
    sequence: payment.sequenceType,
    subscription_id: payment.subscriptionId ?? null,
    amount: Number(payment.amount.value),
    status: payment.status,
    updated_at: new Date().toISOString(),
  });

  if (payment.sequenceType === "first" && payment.status === "paid" && payment.mandateId) {
    await admin.from("organizations").update({ mollie_mandate_id: payment.mandateId }).eq("id", orgId);
    const origin = new URL(request.url).origin;
    await ensureSubscription(orgId, process.env.APP_URL?.replace(/\/$/, "") ?? origin);
  }

  return new NextResponse(null, { status: 200 });
}
