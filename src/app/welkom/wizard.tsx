"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Clock, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Avatar, initial } from "@/components/list-row";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/client";
import { fmt, plural } from "@/i18n/format";
import { LARGEST_PLAN, PLANS, needsQuote, planById, planFits, planFor, type Plan } from "@/lib/plans";
import { acceptLine, disclosureLines, planFeatureLines, trialDates, upgradeLine } from "@/lib/billing-copy";
import type { PayterTerminal } from "@/lib/sync";
import { cn } from "@/lib/utils";
import { connectPayter } from "@/app/(app)/settings/actions";
import { saveTerminalChoices } from "@/app/(app)/terminals/actions";
import { fetchTerminals, finishOnboarding, startTrial, type StartTrialResult } from "./actions";

type Pick = {
  serial: string;
  mine: boolean;
  name: string;
  model: string | null;
  /** Linked here before, but no longer on the Payter account. */
  orphan?: boolean;
};

const STEPS = ["hello", "payter", "machines", "plan", "confirm", "ready"] as const;
type Step = (typeof STEPS)[number];

// One voice for every step: a title that carries it, a quiet paragraph, a soft
// grey note where something needs explaining, and the actions in one row (one
// column of big targets on a phone).
const heroTitleClass = "text-[32px] font-semibold leading-[1.08] tracking-[-0.035em]";
const titleClass = "text-[28px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[32px]";
const bodyClass = "mt-3 max-w-[58ch] text-[15px] leading-relaxed text-muted-foreground sm:text-[16px]";
const noteClass = "max-w-[58ch] rounded-2xl bg-surface px-5 py-4 text-[15px] leading-relaxed";
const inputClass = "h-12 px-4 text-base md:text-[15px]";
const actionsClass = "mt-8 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3";
const quietButtonClass = cn(buttonVariants({ variant: "ghost", size: "lg" }), "w-full font-medium sm:w-auto");
const inlineLinkClass =
  "font-semibold text-foreground underline decoration-foreground/25 underline-offset-4 transition-colors hover:decoration-foreground";

export function Wizard({
  payterConnected,
  chosenPlan,
  knownMachines,
  isVendor,
  paymentsEnabled,
  trialEndsAt,
  returnedFromPayment,
}: {
  payterConnected: boolean;
  chosenPlan: string | null;
  knownMachines: { serial: string; name: string; excluded: boolean }[];
  /** The organisation that sells the app picks no package of its own. */
  isVendor: boolean;
  paymentsEnabled: boolean;
  trialEndsAt: string | null;
  /** Back from Mollie's checkout: the setup is done, only the welcome is left. */
  returnedFromPayment: boolean;
}) {
  const { m, f } = useI18n();
  const router = useRouter();

  // Someone coming back mid-way should not retell the part they finished.
  const [step, setStep] = useState<Step>(returnedFromPayment ? "ready" : payterConnected ? "machines" : "hello");
  const [leaving, setLeaving] = useState(false);
  const [connected, setConnected] = useState(payterConnected);
  const [terminals, setTerminals] = useState<Pick[] | null>(null);
  const [loadingTerminals, setLoadingTerminals] = useState(false);
  const [plan, setPlan] = useState<string | null>(chosenPlan);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const liveRegion = useRef<HTMLParagraphElement>(null);

  const index = STEPS.indexOf(step);
  const chosen = terminals?.filter((t) => t.mine).length ?? knownMachines.filter((k) => !k.excluded).length;

  function go(next: Step) {
    setError(null);
    setLeaving(true);
    // Long enough for the leave to read, short enough not to feel like waiting.
    window.setTimeout(() => {
      setStep(next);
      setLeaving(false);
      window.scrollTo({ top: 0 });
    }, 200);
  }

  async function loadTerminals() {
    setLoadingTerminals(true);
    try {
      const found = await fetchTerminals();
      const known = new Map(knownMachines.map((k) => [k.serial, k]));
      const onPayter = new Set(found.map((t) => t.serial));
      // A machine linked earlier that Payter no longer lists still counts for
      // the package; it has to be on the list to be unticked.
      const orphans: Pick[] = knownMachines
        .filter((k) => !k.excluded && !onPayter.has(k.serial))
        .map((k) => ({ serial: k.serial, model: null, name: k.name !== k.serial ? k.name : "", mine: true, orphan: true }));
      setTerminals([
        ...found.map((t) => {
          const seen = known.get(t.serial);
          return {
            serial: t.serial,
            model: t.model,
            // A name equal to the serial is the placeholder, not a choice.
            name: seen && seen.name !== t.serial ? seen.name : "",
            mine: seen ? !seen.excluded : false,
          };
        }),
        ...orphans,
      ]);
    } catch {
      setTerminals([]);
    } finally {
      setLoadingTerminals(false);
    }
  }

  // The list is what proves the thing works, so it is already being fetched
  // while the operator is still reading the heading.
  useEffect(() => {
    if (step === "machines" && terminals === null && !loadingTerminals) void loadTerminals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    if (liveRegion.current) liveRegion.current.textContent = fmt(m.welcome.stepOf, { step: index + 1, total: STEPS.length });
  }, [index, m.welcome.stepOf]);

  function submitPayter(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await connectPayter(formData);
        if (result.ok) {
          setConnected(true);
          go("machines");
        } else {
          setError(result.reason === "unreachable" ? m.settings.payterUnreachable : m.settings.payterFailed);
        }
      } catch {
        setError(m.settings.payterUnreachable);
      }
    });
  }

  function saveMachines() {
    startTransition(async () => {
      const saved = await saveTerminalChoices(
        (terminals ?? []).map((t) => ({ serial: t.serial, mine: t.mine, name: t.name })),
      );
      // Linking more machines may have moved the package up; the line above
      // the button said so before the click.
      setPlan(saved.plan);
      setAccepted(false);
      go(isVendor ? "ready" : "plan");
    });
  }

  // Choosing is not agreeing: the terms come on their own screen next.
  function pickPlan(p: Plan) {
    if (!planFits(p, chosen)) return;
    setPlan(p.id);
    setAccepted(false);
    go("confirm");
  }

  const failures: Record<Exclude<StartTrialResult, { ok: true }>["reason"], string> = {
    plan: m.billing.tooSmallFailed,
    tooSmall: m.billing.tooSmallFailed,
    notAccepted: m.billing.acceptNeeded,
    vendor: m.billing.tooSmallFailed,
    payment: m.billing.paymentFailed,
  };

  function confirmTrial() {
    if (!plan) return;
    setError(null);
    startTransition(async () => {
      const result = await startTrial(plan, accepted);
      if (!result.ok) {
        setError(failures[result.reason]);
        return;
      }
      if (result.checkoutUrl) window.location.href = result.checkoutUrl;
      else go("ready");
    });
  }

  const pickedPlan = planById(plan);
  const upgrade = upgradeLine(m, f, pickedPlan, chosen, paymentsEnabled);
  const trialEnd = trialDates(trialEndsAt).end;

  function leave(to: string) {
    startTransition(async () => {
      await finishOnboarding();
      router.push(to);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-3xl flex-col px-5 pb-10 pt-3 sm:px-8 sm:pb-14 sm:pt-6">
      <Rail index={index} total={STEPS.length} />
      <p ref={liveRegion} aria-live="polite" className="sr-only" />

      <div key={step} className={cn("flex flex-1 flex-col justify-center py-10", leaving ? "step-leave" : "step-enter")}>
        {step === "hello" && (
          <>
            <h1 style={{ "--i": 0 } as React.CSSProperties} className={heroTitleClass}>
              {m.welcome.helloTitle}
            </h1>
            <p style={{ "--i": 1 } as React.CSSProperties} className={cn(bodyClass, "mt-4")}>
              {m.welcome.helloBody}
            </p>
            <p
              style={{ "--i": 2 } as React.CSSProperties}
              className="mt-4 flex items-start gap-2 text-[13.5px] text-muted-foreground"
            >
              <Clock className="mt-[3px] size-3.5 shrink-0" aria-hidden="true" />
              {m.welcome.helloTime}
            </p>
            <div style={{ "--i": 3 } as React.CSSProperties} className={actionsClass}>
              <Button size="lg" onClick={() => go(connected ? "machines" : "payter")} className="w-full sm:w-auto">
                {m.welcome.helloStart}
                <ArrowRight />
              </Button>
              <button type="button" onClick={() => leave("/")} className={quietButtonClass}>
                {m.welcome.skip}
              </button>
            </div>
          </>
        )}

        {step === "payter" && (
          <>
            <h1 style={{ "--i": 0 } as React.CSSProperties} className={titleClass}>
              {m.welcome.payterTitle}
            </h1>
            <p style={{ "--i": 1 } as React.CSSProperties} className={bodyClass}>
              {m.welcome.payterBody}
            </p>

            {connected ? (
              <div style={{ "--i": 2 } as React.CSSProperties} className="mt-8">
                <p className="flex items-center gap-3 text-[15px] font-semibold">
                  <Avatar tone="positive">
                    <Check strokeWidth={3} />
                  </Avatar>
                  {m.welcome.payterDone}
                </p>
                <div className={actionsClass}>
                  <Button size="lg" onClick={() => go("machines")} className="w-full sm:w-auto">
                    {m.welcome.next}
                    <ArrowRight />
                  </Button>
                  <button type="button" onClick={() => setConnected(false)} className={quietButtonClass}>
                    {m.welcome.payterChange}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p style={{ "--i": 2 } as React.CSSProperties} className={cn(noteClass, "mt-6")}>
                  {m.welcome.payterWhere}
                </p>
                <form
                  style={{ "--i": 3 } as React.CSSProperties}
                  action={submitPayter}
                  className="mt-7 grid max-w-md gap-5"
                >
                  <div className="grid gap-2">
                    <Label htmlFor="username">{m.settings.username}</Label>
                    <Input
                      id="username"
                      name="username"
                      required
                      autoComplete="username"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      className={inputClass}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="password">{m.settings.password}</Label>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      required
                      autoComplete="current-password"
                      className={inputClass}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="domain">{m.settings.domain}</Label>
                    <Input
                      id="domain"
                      name="domain"
                      required
                      autoComplete="off"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      aria-describedby="domain-hint"
                      className={inputClass}
                    />
                    <p id="domain-hint" className="text-[13px] leading-snug text-muted-foreground">
                      {m.settings.domainHint}
                    </p>
                  </div>
                  <p className="flex items-start gap-2 text-[13.5px] leading-snug text-muted-foreground">
                    <ShieldCheck className="mt-px size-4 shrink-0 text-positive" />
                    {m.welcome.payterSafe}
                  </p>
                  {error && <p className="text-[13.5px] font-medium text-negative">{error}</p>}
                  <Button
                    type="submit"
                    size="lg"
                    disabled={isPending}
                    className="mt-1 w-full sm:w-auto sm:justify-self-start"
                  >
                    {isPending ? <Loader2 className="animate-spin" /> : null}
                    {m.welcome.next}
                    {!isPending && <ArrowRight />}
                  </Button>
                </form>
              </>
            )}
          </>
        )}

        {step === "machines" && (
          <>
            <h1 style={{ "--i": 0 } as React.CSSProperties} className={titleClass}>
              {terminals === null || loadingTerminals ? m.welcome.machinesWaiting : m.welcome.machinesTitle}
            </h1>
            <p style={{ "--i": 1 } as React.CSSProperties} className={bodyClass}>
              {terminals === null || loadingTerminals
                ? m.welcome.machinesWaitingBody
                : terminals.length === 0
                  ? m.welcome.machinesNoneBody
                  : m.welcome.machinesBody}
            </p>

            <div style={{ "--i": 2 } as React.CSSProperties} className="mt-7">
              {terminals === null || loadingTerminals ? (
                <ul className="surface-card flex flex-col p-2" aria-hidden="true">
                  {[0, 1, 2].map((i) => (
                    <li key={i} className="flex min-h-16 items-center gap-3.5 px-3 py-3">
                      <span className="skeleton size-10 shrink-0 rounded-full" />
                      <span className="flex flex-1 flex-col gap-2">
                        <span className="skeleton h-3.5 w-40 max-w-full" />
                        <span className="skeleton h-3 w-24" />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : terminals.length === 0 ? (
                <Button variant="outline" size="lg" onClick={() => void loadTerminals()}>
                  <RefreshCw />
                  {m.welcome.machinesRetry}
                </Button>
              ) : (
                <>
                  <ul className="surface-card flex flex-col divide-y p-2">
                    {terminals.map((t) => (
                      <li key={t.serial} className="flex items-start gap-3.5 px-3 py-3 sm:items-center">
                        {/* The tick is the whole row's decision, so it is a big round target. */}
                        <button
                          type="button"
                          aria-pressed={t.mine}
                          aria-label={t.serial}
                          onClick={() =>
                            setTerminals((cur) =>
                              (cur ?? []).map((x) => (x.serial === t.serial ? { ...x, mine: !x.mine } : x)),
                            )
                          }
                          className={cn(
                            "grid size-10 shrink-0 place-items-center rounded-full outline-none transition-[background-color,color,box-shadow,transform] duration-150 focus-visible:ring-3 focus-visible:ring-ring/40 active:scale-[0.96]",
                            t.mine
                              ? "bg-foreground text-background"
                              : "bg-card shadow-[inset_0_0_0_1.5px_var(--input)] hover:bg-surface",
                          )}
                        >
                          {t.mine && <Check className="size-[18px]" strokeWidth={3} />}
                        </button>
                        <span className="flex min-w-0 flex-1 flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4">
                          <span className="min-w-0 flex-1 pt-0.5 sm:pt-0">
                            <span className="block break-all text-[15px] font-semibold tracking-[-0.01em]">
                              {t.serial}
                            </span>
                            {(t.model || t.orphan) && (
                              <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                                {t.orphan ? m.billing.orphan : t.model}
                              </span>
                            )}
                          </span>
                          <Input
                            value={t.name}
                            disabled={!t.mine}
                            placeholder={m.terminals.namePlaceholder}
                            aria-label={m.terminals.nameLabel}
                            onChange={(e) =>
                              setTerminals((cur) =>
                                (cur ?? []).map((x) => (x.serial === t.serial ? { ...x, name: e.target.value } : x)),
                              )
                            }
                            className="w-full sm:w-56"
                          />
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 max-w-[58ch] px-1 text-[13.5px] leading-relaxed text-muted-foreground">
                    {m.welcome.machinesForeign}
                  </p>
                  {upgrade && (
                    <p role="status" className={cn(noteClass, "mt-4 text-sm")}>
                      {upgrade}
                    </p>
                  )}
                </>
              )}
            </div>

            <Nav
              style={{ "--i": 3 } as React.CSSProperties}
              onBack={() => go("payter")}
              onNext={saveMachines}
              nextLabel={m.welcome.next}
              busy={isPending}
              disabled={!terminals || terminals.length === 0}
              backLabel={m.welcome.back}
            />
          </>
        )}

        {step === "plan" && (
          <>
            <h1 style={{ "--i": 0 } as React.CSSProperties} className={titleClass}>
              {m.welcome.planTitle}
            </h1>
            <p style={{ "--i": 1 } as React.CSSProperties} className={bodyClass}>
              {chosen > 0 ? plural(chosen, m.welcome.planBodyOne, m.welcome.planBody) : m.welcome.planBodyNone}
            </p>

            <ul style={{ "--i": 2 } as React.CSSProperties} className="mt-7 grid gap-3 md:grid-cols-3">
              {PLANS.map((p) => {
                const fits = planFits(p, chosen);
                const best = chosen > 0 && !needsQuote(chosen) && planFor(chosen).id === p.id;
                const picked = fits && plan === p.id;
                const why = `plan-${p.id}-why`;
                return (
                  <li
                    key={p.id}
                    aria-current={picked || undefined}
                    className={cn(
                      "surface-card flex flex-col p-5 transition-shadow duration-150 sm:p-6",
                      // Chosen reads as chosen; the one that fits you is ringed in gold.
                      picked ? "ring-2 ring-foreground" : best && "ring-[1.5px] ring-primary",
                    )}
                  >
                    <h2 className={cn("text-[17px] font-semibold tracking-[-0.02em]", !fits && "opacity-55")}>
                      {m.plans[p.id]}
                    </h2>
                    <p
                      className={cn(
                        "tabular mt-3 text-[34px] font-semibold leading-none tracking-[-0.04em]",
                        !fits && "opacity-55",
                      )}
                    >
                      {f.euroRound(p.pricePerMonth)}
                    </p>
                    <p className="mt-2 text-[13px] text-muted-foreground">
                      {m.welcome.planPerMonth} · {m.welcome.planExcl}
                    </p>
                    <ul className={cn("mt-5 flex flex-col gap-2 text-sm leading-snug", !fits && "opacity-55")}>
                      {planFeatureLines(m, p, PLANS).map((line) => (
                        <li key={line.text} className={cn("flex gap-2", line.soon && "text-muted-foreground")}>
                          {line.soon ? (
                            <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                          ) : (
                            <Check
                              className="mt-0.5 size-3.5 shrink-0 text-foreground/70"
                              strokeWidth={3}
                              aria-hidden="true"
                            />
                          )}
                          {line.text}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-auto flex flex-col items-start gap-3 pt-6">
                      {!fits ? (
                        <span id={why} className="text-[13px] font-medium text-muted-foreground">
                          {fmt(m.billing.tooSmall, { count: chosen })}
                        </span>
                      ) : best ? (
                        <span id={why} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#8a6117]">
                          <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                          {plural(chosen, m.billing.fitsOne, m.billing.fits)}
                        </span>
                      ) : null}
                      {/* Coming back to this step, the chosen package still leads on. */}
                      <Button
                        variant={picked || p.featured ? "default" : "outline"}
                        onClick={() => pickPlan(p)}
                        disabled={isPending}
                        aria-disabled={!fits || undefined}
                        aria-describedby={!fits || best ? why : undefined}
                        className={cn("w-full", !fits && "cursor-not-allowed opacity-55")}
                      >
                        {picked && <Check aria-hidden="true" />}
                        {picked ? m.welcome.planChosen : m.welcome.planChoose}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>

            {needsQuote(chosen) && (
              <p style={{ "--i": 3 } as React.CSSProperties} className="mt-5 max-w-[58ch] px-1 text-sm leading-relaxed">
                {fmt(m.billing.quote, { count: LARGEST_PLAN.maxMachines })}{" "}
                <a href="https://www.matoautomaat.be/contact" target="_blank" rel="noreferrer" className={inlineLinkClass}>
                  {m.billing.quoteLink}
                </a>
              </p>
            )}

            <Nav
              style={{ "--i": 4 } as React.CSSProperties}
              onBack={() => go("machines")}
              backLabel={m.welcome.back}
              busy={isPending}
            />
          </>
        )}

        {step === "confirm" && pickedPlan && (
          <>
            <h1 style={{ "--i": 0 } as React.CSSProperties} className={titleClass}>
              {m.welcome.confirmTitle}
            </h1>
            {/* What you are starting, the way a bank shows a payment: name left, amount right. */}
            <p style={{ "--i": 1 } as React.CSSProperties} className="mt-6 flex max-w-[60ch] items-center gap-3.5 px-1">
              <Avatar tone="gold">{initial(m.plans[pickedPlan.id])}</Avatar>
              <span className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-[-0.02em]">
                {m.plans[pickedPlan.id]}
              </span>
              <span className="shrink-0 text-right">
                <span className="tabular block text-[22px] font-semibold leading-tight tracking-[-0.03em]">
                  {f.euroRound(pickedPlan.pricePerMonth)}
                </span>
                <span className="mt-0.5 block text-[13px] text-muted-foreground">
                  {m.welcome.planPerMonth} · {m.welcome.planExcl}
                </span>
              </span>
            </p>

            {/* Every term on this screen itself, not behind a link: the card schemes ask for it. */}
            <ul
              style={{ "--i": 2 } as React.CSSProperties}
              className="surface-card mt-5 flex max-w-[60ch] flex-col gap-3 p-5 text-[15px] leading-relaxed sm:p-6"
            >
              {disclosureLines(m, f, pickedPlan, trialEnd, paymentsEnabled).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>

            {paymentsEnabled && (
              <label
                style={{ "--i": 3 } as React.CSSProperties}
                className="hover-surface mt-4 flex max-w-[60ch] cursor-pointer items-start gap-3 rounded-2xl px-4 py-3.5 text-[15px] leading-relaxed"
              >
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                  className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]"
                />
                <span>{acceptLine(m, f, pickedPlan)}</span>
              </label>
            )}

            {error && (
              <p role="alert" className="mt-4 text-[13.5px] font-medium text-negative">
                {error}
              </p>
            )}

            <Nav
              style={{ "--i": 4 } as React.CSSProperties}
              onBack={() => go("plan")}
              onNext={confirmTrial}
              nextLabel={paymentsEnabled ? m.welcome.confirmStartPay : m.welcome.confirmStart}
              busy={isPending}
              disabled={paymentsEnabled && !accepted}
              backLabel={m.welcome.back}
            />
          </>
        )}

        {step === "ready" && (
          <>
            <h1 style={{ "--i": 0 } as React.CSSProperties} className={heroTitleClass}>
              {m.welcome.readyTitle}
            </h1>
            <p style={{ "--i": 1 } as React.CSSProperties} className={cn(bodyClass, "mt-4")}>
              {m.welcome.readyBody}
            </p>
            <p style={{ "--i": 2 } as React.CSSProperties} className={cn(noteClass, "mt-7")}>
              {m.welcome.readyNext}
              <span className="mt-2 block text-muted-foreground">{m.welcome.readyLater}</span>
            </p>
            <div style={{ "--i": 3 } as React.CSSProperties} className={actionsClass}>
              <Button size="lg" onClick={() => leave("/")} disabled={isPending} className="w-full sm:w-auto">
                {m.welcome.readyToDashboard}
                <ArrowRight />
              </Button>
              <button type="button" onClick={() => leave("/machines")} className={quietButtonClass}>
                {m.welcome.readyContinue}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * How far along, as a line that fills rather than a row of numbered dots. The
 * count sits on the rail's own row: above the heading it would read as a
 * kicker, which is a label the heading does not need.
 */
function Rail({ index, total }: { index: number; total: number }) {
  const { m } = useI18n();
  return (
    <div className="flex items-center gap-4">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-border">
        <div
          className="rail-fill h-full w-full bg-primary"
          style={{ transform: `scaleX(${(index + 1) / total})` }}
        />
      </div>
      <p className="tabular shrink-0 text-[13px] font-medium text-muted-foreground">
        {index + 1}/{total}
      </p>
    </div>
  );
}

function Nav({
  onBack,
  onNext,
  nextLabel,
  backLabel,
  busy,
  disabled,
  style,
}: {
  onBack: () => void;
  onNext?: () => void;
  nextLabel?: string;
  backLabel: string;
  busy?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div style={style} className={actionsClass}>
      {onNext && nextLabel && (
        <Button size="lg" onClick={onNext} disabled={busy || disabled} className="w-full sm:w-auto">
          {busy ? <Loader2 className="animate-spin" /> : null}
          {nextLabel}
          {!busy && <ArrowRight />}
        </Button>
      )}
      <button type="button" onClick={onBack} className={quietButtonClass}>
        <ArrowLeft className="size-4" />
        {backLabel}
      </button>
    </div>
  );
}
