"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Clock, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    startTransition(async () => {
      try {
        await connectPayter(formData);
        setConnected(true);
        go("machines");
      } catch {
        setError(m.settings.payterFailed);
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
    <div className="mx-auto flex min-h-[calc(100svh-5.5rem)] w-full max-w-2xl flex-col px-5 py-8 sm:py-12">
      <Rail index={index} total={STEPS.length} />
      <p ref={liveRegion} aria-live="polite" className="sr-only" />

      <div key={step} className={cn("flex flex-1 flex-col justify-center py-10", leaving ? "step-leave" : "step-enter")}>
        {step === "hello" && (
          <>
            <h1 style={{ "--i": 0 } as React.CSSProperties} className="text-4xl sm:text-5xl">
              {m.welcome.helloTitle}
            </h1>
            <p style={{ "--i": 1 } as React.CSSProperties} className="mt-4 max-w-[58ch] text-[17px] leading-relaxed text-muted-foreground">
              {m.welcome.helloBody}
            </p>
            <p style={{ "--i": 2 } as React.CSSProperties} className="mt-3 text-sm text-muted-foreground">
              {m.welcome.helloTime}
            </p>
            <div style={{ "--i": 3 } as React.CSSProperties} className="mt-8 flex flex-wrap items-center gap-4">
              <Button size="lg" onClick={() => go(connected ? "machines" : "payter")}>
                {m.welcome.helloStart}
                <ArrowRight />
              </Button>
              <button
                type="button"
                onClick={() => leave("/")}
                className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                {m.welcome.skip}
              </button>
            </div>
          </>
        )}

        {step === "payter" && (
          <>
            <h1 style={{ "--i": 0 } as React.CSSProperties} className="text-4xl">
              {m.welcome.payterTitle}
            </h1>
            <p style={{ "--i": 1 } as React.CSSProperties} className="mt-4 max-w-[58ch] text-[17px] leading-relaxed text-muted-foreground">
              {m.welcome.payterBody}
            </p>

            {connected ? (
              <div style={{ "--i": 2 } as React.CSSProperties} className="mt-8">
                <p className="flex items-center gap-2 font-semibold text-positive">
                  <Check className="size-5" strokeWidth={3} />
                  {m.welcome.payterDone}
                </p>
                <div className="mt-6 flex flex-wrap gap-4">
                  <Button size="lg" onClick={() => go("machines")}>
                    {m.welcome.next}
                    <ArrowRight />
                  </Button>
                  <button
                    type="button"
                    onClick={() => setConnected(false)}
                    className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
                  >
                    {m.welcome.payterChange}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p style={{ "--i": 2 } as React.CSSProperties} className="mt-6 max-w-[58ch] bg-surface p-4 text-[15px] leading-relaxed">
                  {m.welcome.payterWhere}
                </p>
                <form style={{ "--i": 3 } as React.CSSProperties} action={submitPayter} className="mt-6 grid max-w-md gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="username">{m.settings.username}</Label>
                    <Input id="username" name="username" required autoComplete="username" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="password">{m.settings.password}</Label>
                    <Input id="password" name="password" type="password" required autoComplete="current-password" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="domain">{m.settings.domain}</Label>
                    <Input id="domain" name="domain" required />
                  </div>
                  <p className="flex items-start gap-2 text-sm text-muted-foreground">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-positive" />
                    {m.welcome.payterSafe}
                  </p>
                  {error && <p className="text-sm text-negative">{error}</p>}
                  <Button type="submit" size="lg" disabled={isPending} className="mt-1 justify-self-start">
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
            <h1 style={{ "--i": 0 } as React.CSSProperties} className="text-4xl">
              {terminals === null || loadingTerminals ? m.welcome.machinesWaiting : m.welcome.machinesTitle}
            </h1>
            <p style={{ "--i": 1 } as React.CSSProperties} className="mt-4 max-w-[58ch] text-[17px] leading-relaxed text-muted-foreground">
              {terminals === null || loadingTerminals
                ? m.welcome.machinesWaitingBody
                : terminals.length === 0
                  ? m.welcome.machinesNoneBody
                  : m.welcome.machinesBody}
            </p>

            <div style={{ "--i": 2 } as React.CSSProperties} className="mt-7">
              {terminals === null || loadingTerminals ? (
                <ul className="flex flex-col divide-y border bg-card" aria-hidden="true">
                  {[0, 1, 2].map((i) => (
                    <li key={i} className="flex items-center gap-4 p-4">
                      <span className="size-9 shrink-0 bg-muted" />
                      <span className="flex flex-1 flex-col gap-2">
                        <span className="h-3 w-40 bg-muted" />
                        <span className="h-2.5 w-24 bg-muted/70" />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : terminals.length === 0 ? (
                <Button variant="outline" onClick={() => void loadTerminals()}>
                  <RefreshCw />
                  {m.welcome.machinesRetry}
                </Button>
              ) : (
                <>
                  <ul className="flex flex-col divide-y border bg-card">
                    {terminals.map((t) => (
                      <li key={t.serial} className={cn("flex flex-wrap items-center gap-4 p-4", t.mine && "bg-accent/40")}>
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
                            "grid size-9 shrink-0 place-items-center border-2 transition-colors",
                            t.mine ? "border-positive bg-positive text-white" : "border-input bg-card",
                          )}
                        >
                          {t.mine && <Check className="size-5" strokeWidth={3} />}
                        </button>
                        <span className="min-w-0 flex-1">
                          <span className="block font-mono text-sm font-semibold">{t.serial}</span>
                          {(t.model || t.orphan) && (
                            <span className="block truncate text-xs text-muted-foreground">
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
                          className="w-full sm:w-52"
                        />
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 max-w-[58ch] text-sm text-muted-foreground">{m.welcome.machinesForeign}</p>
                  {upgrade && (
                    <p role="status" className="mt-4 max-w-[58ch] bg-surface p-4 text-sm">
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
            <h1 style={{ "--i": 0 } as React.CSSProperties} className="text-4xl">
              {m.welcome.planTitle}
            </h1>
            <p style={{ "--i": 1 } as React.CSSProperties} className="mt-4 max-w-[58ch] text-[17px] leading-relaxed text-muted-foreground">
              {chosen > 0 ? plural(chosen, m.welcome.planBodyOne, m.welcome.planBody) : m.welcome.planBodyNone}
            </p>

            <ul style={{ "--i": 2 } as React.CSSProperties} className="mt-7 grid gap-px bg-border sm:grid-cols-3">
              {PLANS.map((p) => {
                const fits = planFits(p, chosen);
                const best = chosen > 0 && !needsQuote(chosen) && planFor(chosen).id === p.id;
                const picked = fits && plan === p.id;
                const why = `plan-${p.id}-why`;
                return (
                  <li
                    key={p.id}
                    aria-current={picked || undefined}
                    className={cn("flex flex-col gap-1 p-5", picked ? "bg-accent" : "bg-card")}
                  >
                    <h2 className={cn("font-heading text-lg font-semibold text-heading", !fits && "opacity-55")}>
                      {m.plans[p.id]}
                    </h2>
                    <p className={cn("tabular font-heading text-3xl font-bold", !fits && "opacity-55")}>
                      {f.euroRound(p.pricePerMonth)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {m.welcome.planPerMonth} · {m.welcome.planExcl}
                    </p>
                    <ul className={cn("mt-4 flex flex-col gap-1.5 text-sm", !fits && "opacity-55")}>
                      {planFeatureLines(m, p, PLANS).map((line) => (
                        <li key={line.text} className={cn("flex gap-2", line.soon && "text-muted-foreground")}>
                          {line.soon ? (
                            <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                          ) : (
                            <Check className="mt-0.5 size-3.5 shrink-0 text-positive" strokeWidth={3} aria-hidden="true" />
                          )}
                          {line.text}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-auto flex flex-col items-start gap-3 pt-4">
                      {!fits ? (
                        <span id={why} className="text-xs font-semibold text-muted-foreground">
                          {fmt(m.billing.tooSmall, { count: chosen })}
                        </span>
                      ) : best ? (
                        <span
                          id={why}
                          className="inline-flex rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-accent-foreground"
                        >
                          {plural(chosen, m.billing.fitsOne, m.billing.fits)}
                        </span>
                      ) : null}
                      {/* Coming back to this step, the chosen package still leads on. */}
                      <Button
                        variant={picked || p.featured ? "default" : "outline"}
                        size="sm"
                        onClick={() => pickPlan(p)}
                        disabled={isPending}
                        aria-disabled={!fits || undefined}
                        aria-describedby={!fits || best ? why : undefined}
                        className={cn(!fits && "cursor-not-allowed opacity-55")}
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
              <p style={{ "--i": 3 } as React.CSSProperties} className="mt-5 max-w-[58ch] text-sm">
                {fmt(m.billing.quote, { count: LARGEST_PLAN.maxMachines })}{" "}
                <a
                  href="https://www.matoautomaat.be/contact"
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold underline underline-offset-4"
                >
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
            <h1 style={{ "--i": 0 } as React.CSSProperties} className="text-4xl">
              {m.welcome.confirmTitle}
            </h1>
            <p style={{ "--i": 1 } as React.CSSProperties} className="mt-4 text-[17px] text-muted-foreground">
              <span className="font-semibold text-foreground">{m.plans[pickedPlan.id]}</span>
              {" · "}
              <span className="tabular">{f.euroRound(pickedPlan.pricePerMonth)}</span> {m.welcome.planPerMonth} ·{" "}
              {m.welcome.planExcl}
            </p>

            {/* Every term on this screen itself, not behind a link: the card schemes ask for it. */}
            <ul
              style={{ "--i": 2 } as React.CSSProperties}
              className="mt-6 flex max-w-[60ch] flex-col gap-3 border bg-card p-5 text-[15px] leading-relaxed"
            >
              {disclosureLines(m, f, pickedPlan, trialEnd, paymentsEnabled).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>

            {paymentsEnabled && (
              <label
                style={{ "--i": 3 } as React.CSSProperties}
                className="mt-5 flex max-w-[60ch] cursor-pointer items-start gap-3 text-[15px]"
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
              <p role="alert" className="mt-4 text-sm text-negative">
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
            <h1 style={{ "--i": 0 } as React.CSSProperties} className="text-4xl sm:text-5xl">
              {m.welcome.readyTitle}
            </h1>
            <p style={{ "--i": 1 } as React.CSSProperties} className="mt-4 max-w-[58ch] text-[17px] leading-relaxed text-muted-foreground">
              {m.welcome.readyBody}
            </p>
            <p style={{ "--i": 2 } as React.CSSProperties} className="mt-6 max-w-[58ch] bg-surface p-4 text-[15px] leading-relaxed">
              {m.welcome.readyNext}
              <span className="mt-2 block text-muted-foreground">{m.welcome.readyLater}</span>
            </p>
            <div style={{ "--i": 3 } as React.CSSProperties} className="mt-8 flex flex-wrap items-center gap-4">
              <Button size="lg" onClick={() => leave("/")} disabled={isPending}>
                {m.welcome.readyToDashboard}
                <ArrowRight />
              </Button>
              <button
                type="button"
                onClick={() => leave("/machines")}
                className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
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
      <div className="h-1 flex-1 overflow-hidden bg-border">
        <div
          className="rail-fill h-full w-full bg-primary"
          style={{ transform: `scaleX(${(index + 1) / total})` }}
        />
      </div>
      <p className="tabular shrink-0 font-mono text-xs font-semibold text-muted-foreground">
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
    <div style={style} className="mt-8 flex flex-wrap items-center gap-4">
      {onNext && nextLabel && (
        <Button size="lg" onClick={onNext} disabled={busy || disabled}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          {nextLabel}
          {!busy && <ArrowRight />}
        </Button>
      )}
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        {backLabel}
      </button>
    </div>
  );
}
