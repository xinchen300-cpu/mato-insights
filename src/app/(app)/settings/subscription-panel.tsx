"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreditCard } from "lucide-react";
import { Section } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { PLANS, SUPPORT_PHONE, planById, planFits, priceInclVat, type Plan } from "@/lib/plans";
import { planChangeLine } from "@/lib/billing-copy";
import type { BillingStatus } from "@/lib/billing";
import { cn } from "@/lib/utils";
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
      // The anchor wraps the title too, so a link to #abonnement lands on the heading.
      <div id="abonnement" className="scroll-mt-20">
        <Section title={m.billing.title} hint={m.billing.hint}>
          <div className="surface-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <p className="text-[15px] text-muted-foreground">{m.billing.statusNone}</p>
            <Link href="/welkom" className={cn(buttonVariants(), "w-fit")}>
              {m.welcome.planTitle}
            </Link>
          </div>
        </Section>
      </div>
    );
  }

  // A status the size of a word: a small dot, a quiet label.
  const badge =
    status === "trial" && trialEndsAt
      ? { text: fmt(m.billing.statusTrial, { date: f.date(trialEndsAt) }), dot: "bg-primary" }
      : status === "cancelled"
        ? { text: m.billing.statusCancelled, dot: "bg-muted-foreground/40" }
        : status === "ended"
          ? { text: m.billing.statusEnded, dot: "bg-muted-foreground/40" }
          : { text: m.billing.statusActive, dot: "bg-positive" };

  const others = PLANS.filter((p) => p.id !== plan.id && planFits(p, machines));
  const chargeDate = firstChargeOn ?? trialEndsAt;

  return (
    <div id="abonnement" className="scroll-mt-20">
      <Section title={m.billing.title} hint={m.billing.hint}>
        <div className="surface-card">
          {/* What you have: the one big thing on this page. */}
          <div className="flex flex-col gap-5 px-5 pb-6 pt-6 sm:px-7 sm:pt-7">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
                <p className="text-[14px] font-medium text-muted-foreground">{m.billing.current}</p>
                <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
                  <span className={cn("size-1.5 shrink-0 rounded-full", badge.dot)} aria-hidden="true" />
                  {badge.text}
                </span>
              </div>
              <p className="mt-2 font-heading text-[28px] font-semibold leading-tight tracking-[-0.03em] text-heading sm:text-[30px]">
                {m.plans[plan.id]}
              </p>
              <p className="mt-1.5 text-[14px] text-muted-foreground">
                <span className="tabular text-[15px] font-semibold text-foreground">{f.euro(plan.pricePerMonth)}</span>{" "}
                {m.welcome.planPerMonth} · {m.welcome.planExcl} ·{" "}
                {fmt(m.billing.inclVat, { amount: f.euro(priceInclVat(plan)) })}
              </p>
            </div>

            {returnedFromPayment && hasMandate && (
              <p className="text-[14px] font-semibold text-positive">{m.billing.paymentOk}</p>
            )}

            {status === "ended" && (
              <p className="max-w-[56ch] text-[14px] text-muted-foreground">{m.billing.endedNote}</p>
            )}

            {SUPPORT_PHONE && plan.features.includes("phoneSupport") && (
              <p className="text-[14px]">
                {fmt(m.billing.callUs, { phone: "" })}
                <a href={`tel:${SUPPORT_PHONE.replace(/\s/g, "")}`} className="font-semibold underline underline-offset-4">
                  {SUPPORT_PHONE}
                </a>
              </p>
            )}

            {status !== "cancelled" && paymentsEnabled && !hasMandate && trialEndsAt && (
              <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <p className="max-w-[52ch] text-[14px]">{fmt(m.billing.noPaymentYet, { date: f.date(trialEndsAt) })}</p>
                <Button onClick={pay} disabled={isPending} className="w-fit shrink-0">
                  <CreditCard />
                  {m.billing.addPayment}
                </Button>
              </div>
            )}

            {status !== "cancelled" && paymentsEnabled && hasMandate && status === "trial" && chargeDate && (
              <p className="text-[14px]">
                {fmt(m.billing.firstCharge, { date: f.date(chargeDate), incl: f.euro(priceInclVat(plan)) })}
              </p>
            )}
          </div>

          {status !== "cancelled" && others.length > 0 && (
            <div className="border-t px-5 py-5 sm:px-7">
              <p className="text-[14px] font-medium text-muted-foreground">{m.billing.change}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {others.map((p) => (
                  <Button
                    key={p.id}
                    variant={switchTo?.id === p.id ? "default" : "secondary"}
                    disabled={isPending}
                    onClick={() => setSwitchTo(p)}
                  >
                    {fmt(m.billing.changeTo, { plan: m.plans[p.id] })} · {f.euroRound(p.pricePerMonth)}
                  </Button>
                ))}
              </div>
              {switchTo && (
                <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-surface p-4">
                  <p className="max-w-[56ch] text-[14px]">{planChangeLine(m, f, switchTo)}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => run(() => changePlan(switchTo.id))} disabled={isPending}>
                      {m.billing.changeConfirmButton}
                    </Button>
                    <Button variant="ghost" onClick={() => setSwitchTo(null)} disabled={isPending}>
                      {m.billing.cancelNo}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* The way out: always here, never louder than it needs to be. */}
          <div className="border-t px-5 py-4 sm:px-7">
            {status === "cancelled" ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[14px] text-muted-foreground">{m.billing.cancelled}</p>
                <Button
                  variant="secondary"
                  onClick={() => run(resumeSubscription)}
                  disabled={isPending}
                  className="w-fit shrink-0"
                >
                  {m.billing.resume}
                </Button>
              </div>
            ) : confirming ? (
              <div className="flex flex-col gap-3 py-1">
                <p className="max-w-[56ch] text-[14px]">{m.billing.cancelConfirm}</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="destructive" onClick={() => run(cancelSubscription)} disabled={isPending}>
                    {m.billing.cancelYes}
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirming(false)} disabled={isPending}>
                    {m.billing.cancelNo}
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="-mx-1 rounded-md px-1 py-1 text-[14px] text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
              >
                {m.billing.cancel}
              </button>
            )}
          </div>
        </div>
      </Section>
    </div>
  );
}
