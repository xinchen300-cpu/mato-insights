"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreditCard } from "lucide-react";
import { Panel } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { PLANS, SUPPORT_PHONE, planById, planFits, priceInclVat, type Plan } from "@/lib/plans";
import { planChangeLine } from "@/lib/billing-copy";
import type { BillingStatus } from "@/lib/billing";
import { addPaymentDetails, cancelSubscription, changePlan, resumeSubscription } from "./billing-actions";

/**
 * The whole subscription on one panel: what you have, until when it is free,
 * what you will pay and when, and the way out. Cancelling is a button here,
 * not a phone call — that is the law of the card schemes and the right thing.
 */
export function SubscriptionPanel({
  planId,
  status,
  trialEndsAt,
  firstChargeOn,
  paymentsEnabled,
  hasMandate,
  machines,
  returnedFromPayment,
}: {
  planId: string | null;
  status: BillingStatus;
  trialEndsAt: string | null;
  firstChargeOn: string | null;
  paymentsEnabled: boolean;
  hasMandate: boolean;
  machines: number;
  returnedFromPayment: boolean;
}) {
  const { m, f } = useI18n();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  // A package change is shown with its price first; the click only picks.
  const [switchTo, setSwitchTo] = useState<Plan | null>(null);
  const [isPending, startTransition] = useTransition();
  const plan = planById(planId);

  function run(action: () => Promise<unknown>) {
    startTransition(async () => {
      await action();
      setConfirming(false);
      setSwitchTo(null);
      router.refresh();
    });
  }

  function pay() {
    startTransition(async () => {
      const { checkoutUrl } = await addPaymentDetails();
      if (checkoutUrl) window.location.href = checkoutUrl;
    });
  }

  if (!plan) {
    return (
      <Panel title={m.billing.title} hint={m.billing.hint}>
        <div id="abonnement" className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">{m.billing.statusNone}</p>
          <Link href="/welkom" className={buttonVariants({ variant: "outline" })}>
            {m.welcome.planTitle}
          </Link>
        </div>
      </Panel>
    );
  }

  const badge =
    status === "trial" && trialEndsAt
      ? { text: fmt(m.billing.statusTrial, { date: f.date(trialEndsAt) }), className: "bg-primary/15 text-accent-foreground" }
      : status === "cancelled"
        ? { text: m.billing.statusCancelled, className: "bg-muted text-muted-foreground" }
        : status === "ended"
          ? { text: m.billing.statusEnded, className: "bg-muted text-muted-foreground" }
          : { text: m.billing.statusActive, className: "bg-positive/15 text-positive" };

  const others = PLANS.filter((p) => p.id !== plan.id && planFits(p, machines));
  const chargeDate = firstChargeOn ?? trialEndsAt;

  return (
    <Panel
      title={m.billing.title}
      hint={m.billing.hint}
      actions={<Badge className={badge.className}>{badge.text}</Badge>}
    >
      <div id="abonnement" className="flex flex-col gap-5">
        <div>
          <p className="text-sm text-muted-foreground">{m.billing.current}</p>
          <p className="mt-1">
            <span className="font-heading text-2xl font-semibold text-heading">{m.plans[plan.id]}</span>{" "}
            <span className="tabular font-semibold">{f.euro(plan.pricePerMonth)}</span>{" "}
            <span className="text-sm text-muted-foreground">
              {m.welcome.planPerMonth} · {m.welcome.planExcl} ·{" "}
              {fmt(m.billing.inclVat, { amount: f.euro(priceInclVat(plan)) })}
            </span>
          </p>
        </div>

        {returnedFromPayment && hasMandate && <p className="text-sm font-semibold text-positive">{m.billing.paymentOk}</p>}

        {status === "ended" && <p className="max-w-[56ch] text-sm text-muted-foreground">{m.billing.endedNote}</p>}

        {SUPPORT_PHONE && plan.features.includes("phoneSupport") && (
          <p className="text-sm">
            {fmt(m.billing.callUs, { phone: "" })}
            <a href={`tel:${SUPPORT_PHONE.replace(/\s/g, "")}`} className="font-semibold underline underline-offset-4">
              {SUPPORT_PHONE}
            </a>
          </p>
        )}

        {status !== "cancelled" && paymentsEnabled && !hasMandate && trialEndsAt && (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-surface p-4">
            <p className="max-w-[52ch] text-sm">{fmt(m.billing.noPaymentYet, { date: f.date(trialEndsAt) })}</p>
            <Button onClick={pay} disabled={isPending}>
              <CreditCard />
              {m.billing.addPayment}
            </Button>
          </div>
        )}

        {status !== "cancelled" && paymentsEnabled && hasMandate && status === "trial" && chargeDate && (
          <p className="text-sm">
            {fmt(m.billing.firstCharge, { date: f.date(chargeDate), incl: f.euro(priceInclVat(plan)) })}
          </p>
        )}

        {status !== "cancelled" && others.length > 0 && (
          <div>
            <p className="text-sm text-muted-foreground">{m.billing.change}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {others.map((p) => (
                <Button
                  key={p.id}
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={() => setSwitchTo(p)}
                >
                  {fmt(m.billing.changeTo, { plan: m.plans[p.id] })} · {f.euroRound(p.pricePerMonth)}
                </Button>
              ))}
            </div>
            {switchTo && (
              <div className="mt-3 flex flex-col gap-3 bg-surface p-4">
                <p className="max-w-[56ch] text-sm">{planChangeLine(m, f, switchTo)}</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => run(() => changePlan(switchTo.id))} disabled={isPending}>
                    {m.billing.changeConfirmButton}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSwitchTo(null)} disabled={isPending}>
                    {m.billing.cancelNo}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="border-t pt-4">
          {status === "cancelled" ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">{m.billing.cancelled}</p>
              <Button variant="outline" size="sm" onClick={() => run(resumeSubscription)} disabled={isPending}>
                {m.billing.resume}
              </Button>
            </div>
          ) : confirming ? (
            <div className="flex flex-col gap-3">
              <p className="max-w-[56ch] text-sm">{m.billing.cancelConfirm}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="destructive" size="sm" onClick={() => run(cancelSubscription)} disabled={isPending}>
                  {m.billing.cancelYes}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={isPending}>
                  {m.billing.cancelNo}
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              {m.billing.cancel}
            </button>
          )}
        </div>
      </div>
    </Panel>
  );
}
