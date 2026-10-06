import Link from "next/link";
import { Check, CircleDashed } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { fmt } from "@/i18n/format";
import type { Messages } from "@/i18n/messages";
import type { SetupState } from "@/lib/data";
import { cn } from "@/lib/utils";

type Step = {
  title: string;
  why: string;
  /** Extra guidance, shown only while this is the step to do next. */
  how?: string;
  state: string | null;
  done: boolean;
  href: string;
  action: string;
};

/**
 * What to do first, for somebody who has just bought the app and sees an empty
 * dashboard. Each step says why it matters, not only what to click, and the
 * whole panel is gone once the machines are reporting.
 */
/** The six setup steps, in order. */
export function setupSteps(setup: SetupState, m: Messages): Step[] {
  return [
    {
      title: m.setup.payter,
      why: m.setup.payterWhy,
      how: m.setup.payterHow,
      state: null,
      done: setup.payterConnected,
      href: "/settings",
      action: m.setup.payterDo,
    },
    {
      title: m.setup.machines,
      why: m.setup.machinesWhy,
      state: setup.machines > 0 ? fmt(m.setup.machinesFound, { count: setup.machines }) : m.setup.machinesWaiting,
      done: setup.machines > 0,
      href: "/terminals",
      action: m.terminals.title,
    },
    {
      title: m.setup.naming,
      why: m.setup.namingWhy,
      state:
        setup.machines > setup.namedMachines
          ? fmt(m.setup.namingLeft, { count: setup.machines - setup.namedMachines })
          : null,
      done: setup.machines > 0 && setup.namedMachines === setup.machines,
      href: "/terminals",
      action: m.terminals.title,
    },
    {
      title: m.setup.layout,
      why: m.setup.layoutWhy,
      state:
        setup.machines > setup.withLayout
          ? fmt(m.setup.layoutLeft, { count: setup.machines - setup.withLayout })
          : null,
      done: setup.machines > 0 && setup.withLayout === setup.machines,
      href: "/machines",
      action: m.nav.machines,
    },
    {
      title: m.setup.products,
      why: m.setup.productsWhy,
      state: null,
      done: setup.products > 0,
      href: "/products",
      action: m.setup.productsDo,
    },
    {
      title: m.setup.linking,
      why: m.setup.linkingWhy,
      state: null,
      done: setup.linkedSelections > 0,
      href: "/machines",
      action: m.setup.linkingDo,
    },
  ];

}

/** The first step not done yet, for the one line on a dashboard that already has sales. */
export function nextSetupStep(setup: SetupState, m: Messages): Step | null {
  return setupSteps(setup, m).find((step) => !step.done) ?? null;
}

export function SetupGuide({ setup, m }: { setup: SetupState; m: Messages }) {
  const steps = setupSteps(setup, m);
  const done = steps.filter((s) => s.done).length;
  const next = steps.findIndex((s) => !s.done);

  return (
    <section className="border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-heading text-xl font-semibold text-heading">{m.setup.title}</h2>
        <span className="tabular text-sm text-muted-foreground">
          {fmt(m.setup.stepOf, { done, total: steps.length })}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{m.setup.hint}</p>

      <div className="mt-4 flex gap-1" aria-hidden="true">
        {steps.map((step, i) => (
          <span key={i} className={cn("h-1 flex-1", step.done ? "bg-primary" : "bg-border")} />
        ))}
      </div>

      <ol className="mt-4 flex flex-col divide-y">
        {steps.map((step, i) => (
          <li key={i} className="flex flex-wrap items-start gap-3 py-3.5">
            <span
              className={cn(
                "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
                step.done ? "bg-positive text-white" : i === next ? "bg-primary/15 text-primary" : "text-muted-foreground/50",
              )}
            >
              {step.done ? <Check className="size-3.5" strokeWidth={3} /> : <CircleDashed className="size-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn("block font-semibold", step.done && "font-normal text-muted-foreground")}>
                {step.title}
              </span>
              {!step.done && <span className="mt-0.5 block text-sm text-muted-foreground">{step.why}</span>}
              {!step.done && i === next && step.how && (
                <span className="mt-2 block bg-surface px-3 py-2 text-sm">{step.how}</span>
              )}
              {!step.done && step.state && (
                <span className="mt-1 block text-sm text-accent-foreground">{step.state}</span>
              )}
            </span>
            {!step.done && i === next && (
              <Link href={step.href} className={buttonVariants({ size: "sm" })}>
                {step.action}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
