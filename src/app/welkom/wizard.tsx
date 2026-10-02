"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { PLANS, planFor, type Plan } from "@/lib/plans";
import type { PayterTerminal } from "@/lib/sync";
import { cn } from "@/lib/utils";
import { connectPayter } from "@/app/(app)/settings/actions";
import { saveTerminalChoices } from "@/app/(app)/terminals/actions";
import { choosePlan, fetchTerminals, finishOnboarding } from "./actions";

type Pick = { serial: string; mine: boolean; name: string; model: string | null };

const STEPS = ["hello", "payter", "machines", "plan", "ready"] as const;
type Step = (typeof STEPS)[number];

export function Wizard({
  payterConnected,
  chosenPlan,
  knownMachines,
}: {
  payterConnected: boolean;
  chosenPlan: string | null;
  knownMachines: { serial: string; name: string; excluded: boolean }[];
}) {
  const { m, f } = useI18n();
  const router = useRouter();

  // Someone coming back mid-way should not retell the part they finished.
  const [step, setStep] = useState<Step>(payterConnected ? "machines" : "hello");
  const [leaving, setLeaving] = useState(false);
  const [connected, setConnected] = useState(payterConnected);
  const [terminals, setTerminals] = useState<Pick[] | null>(null);
  const [loadingTerminals, setLoadingTerminals] = useState(false);
  const [plan, setPlan] = useState<string | null>(chosenPlan);
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
      setTerminals(
        found.map((t) => {
          const seen = known.get(t.serial);
          return {
            serial: t.serial,
            model: t.model,
            // A name equal to the serial is the placeholder, not a choice.
            name: seen && seen.name !== t.serial ? seen.name : "",
            mine: seen ? !seen.excluded : false,
          };
        }),
      );
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
      await saveTerminalChoices((terminals ?? []).map((t) => ({ serial: t.serial, mine: t.mine, name: t.name })));
      go("plan");
    });
  }

  function pickPlan(p: Plan) {
    setPlan(p.id);
    startTransition(async () => {
      await choosePlan(p.id);
      go("ready");
    });
  }

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
                          {t.model && <span className="block truncate text-xs text-muted-foreground">{t.model}</span>}
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
              {chosen > 0 ? fmt(m.welcome.planBody, { count: chosen }) : m.welcome.planBodyNone}
            </p>

            <ul style={{ "--i": 2 } as React.CSSProperties} className="mt-7 grid gap-px bg-border sm:grid-cols-3">
              {PLANS.map((p) => {
                const fits = chosen > 0 && planFor(chosen).id === p.id;
                const picked = plan === p.id;
                return (
                  <li key={p.id} className="bg-card">
                    <button
                      type="button"
                      onClick={() => pickPlan(p)}
                      disabled={isPending}
                      className={cn(
                        "flex h-full w-full flex-col items-start gap-1 p-5 text-left transition-colors",
                        picked ? "bg-accent" : "hover:bg-surface",
                      )}
                    >
                      <span className="font-heading text-lg font-semibold text-heading">{m.plans[p.id]}</span>
                      <span className="tabular font-heading text-3xl font-bold">{f.euro(p.pricePerMonth)}</span>
                      <span className="text-xs text-muted-foreground">
                        {m.welcome.planPerMonth} · {m.welcome.planExcl}
                      </span>
                      <span className="mt-3 text-sm">
                        {p.maxMachines === null
                          ? m.welcome.planUnlimited
                          : fmt(m.welcome.planMachines, { count: p.maxMachines })}
                      </span>
                      {fits && (
                        <span className="mt-3 inline-flex rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-accent-foreground">
                          {fmt(m.welcome.planFits, { count: chosen })}
                        </span>
                      )}
                      {picked && (
                        <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-positive">
                          <Check className="size-4" strokeWidth={3} />
                          {m.welcome.planChosen}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

            <p style={{ "--i": 3 } as React.CSSProperties} className="mt-5 max-w-[58ch] text-sm text-muted-foreground">
              {m.welcome.planNoPayment}
            </p>

            <Nav
              style={{ "--i": 4 } as React.CSSProperties}
              onBack={() => go("machines")}
              backLabel={m.welcome.back}
              busy={isPending}
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
