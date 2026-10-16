"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ClipboardList,
  Flag,
  MessageSquareText,
  PackageOpen,
  Pause,
  Play,
  Plus,
  Timer,
  TriangleAlert,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import { VendlyMark, VendlyWordmark } from "@/components/brand/vendly-mark";
import { MachineIcon } from "@/components/machine/machine-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { MAX_CHECKS, MAX_CHECK_LENGTH, MAX_MESSAGE_LENGTH, type RoundSettings } from "@/lib/round-settings";
import { cn } from "@/lib/utils";
import { saveRoundSettings } from "../actions";

type Step = "plan" | "pick" | "start" | "stop" | "back" | "finish";
const STEPS: { key: Step; icon: LucideIcon | typeof MachineIcon; who: "you" | "filler" }[] = [
  { key: "plan", icon: ClipboardList, who: "you" },
  { key: "pick", icon: PackageOpen, who: "filler" },
  { key: "start", icon: Play, who: "filler" },
  { key: "stop", icon: MachineIcon, who: "filler" },
  { key: "back", icon: Undo2, who: "filler" },
  { key: "finish", icon: Flag, who: "filler" },
];
const PLAY_MS = 3600;

/**
 * The round as a little map the operator can walk through: each step with
 * what the filler sees on their phone and what the operator sees on theirs,
 * built from this organisation's own machines and products. Beside it, the
 * operator's say in the round; every change shows in the previews at once.
 */
export function WorkflowStudio({
  initial,
  filler,
  machines,
  products,
  cost,
}: {
  initial: RoundSettings;
  filler: string | null;
  machines: string[];
  products: string[];
  cost: string;
}) {
  const { m } = useI18n();
  const t = m.workflow;
  const [settings, setSettings] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(settings) !== JSON.stringify(saved);

  // Playing walks through the round on its own, and stops at the end.
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => {
      if (active >= STEPS.length - 1) setPlaying(false);
      else setActive((step) => step + 1);
    }, PLAY_MS);
    return () => clearTimeout(timer);
  }, [playing, active]);

  const show = (step: Step) => {
    setPlaying(false);
    setActive(STEPS.findIndex((s) => s.key === step));
  };
  const change = (next: Partial<RoundSettings>, step: Step) => {
    setSettings((current) => ({ ...current, ...next }));
    setJustSaved(false);
    show(step);
  };

  function save() {
    setError(false);
    startTransition(async () => {
      try {
        const clean = await saveRoundSettings(settings);
        setSettings(clean);
        setSaved(clean);
        setJustSaved(true);
      } catch {
        setError(true);
      }
    });
  }

  const step = STEPS[active].key;
  const names = {
    filler: filler ?? t.demoFiller,
    hello: filler ? fmt(m.round.hello, { name: filler }) : t.demoHello,
    machines: [0, 1, 2].map((i) => machines[i] ?? fmt(t.demoMachine, { n: i + 1 })),
    products: [0, 1, 2, 3].map((i) => products[i] ?? fmt(m.unassigned.selection, { number: 11 + i * 2 })),
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="surface-card flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[18px] font-semibold tracking-[-0.02em]">{t.mapTitle}</h2>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (playing) return setPlaying(false);
              if (active >= STEPS.length - 1) setActive(0);
              setPlaying(true);
            }}
          >
            {playing ? <Pause /> : <Play />}
            {playing ? t.stop : t.play}
          </Button>
        </div>
        <RoundMap active={active} playing={playing} settings={settings} onPick={(index) => (setPlaying(false), setActive(index))} />
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-w-0 flex-col gap-3">
          <p className="px-1 text-[13px] font-medium text-muted-foreground">{t.example}</p>
          <div
            key={step}
            className="grid gap-6 animate-in fade-in slide-in-from-bottom-2 duration-500 sm:grid-cols-[260px_minmax(0,1fr)] lg:grid-cols-1 xl:grid-cols-[260px_minmax(0,1fr)]"
          >
            <figure className="flex flex-col gap-3">
              <figcaption className="px-1 text-[14px] font-semibold">{t.fillerSees}</figcaption>
              <Phone>
                <FillerScreen step={step} settings={settings} names={names} />
              </Phone>
              <p className="px-1 text-[14px] text-muted-foreground">{t[`${stepKey(step)}Filler`]}</p>
            </figure>
            <figure className="flex flex-col gap-3">
              <figcaption className="px-1 text-[14px] font-semibold">{t.youSee}</figcaption>
              <div className="flex min-h-[200px] flex-col gap-3 rounded-[28px] bg-surface p-4">
                <OwnerScreen step={step} settings={settings} names={names} cost={cost} />
              </div>
              <p className="px-1 text-[14px] text-muted-foreground">{t[`${stepKey(step)}You`]}</p>
            </figure>
          </div>
        </section>

        <aside className="surface-card flex flex-col gap-6 p-5 sm:p-6 lg:sticky lg:top-24">
          <div>
            <h2 className="text-[18px] font-semibold tracking-[-0.02em]">{t.settingsTitle}</h2>
            <p className="mt-1 text-[14px] text-muted-foreground">{t.settingsHint}</p>
          </div>

          <ChecksEditor
            checks={settings.checks}
            onChange={(checks) => change({ checks }, "stop")}
            onFocus={() => show("stop")}
          />

          <label className="flex flex-col gap-2">
            <span className="text-[15px] font-semibold">{t.messageLabel}</span>
            <span className="-mt-1 text-[13px] text-muted-foreground">{t.messageHint}</span>
            <textarea
              value={settings.message ?? ""}
              maxLength={MAX_MESSAGE_LENGTH}
              rows={3}
              placeholder={t.messagePlaceholder}
              onFocus={() => show("start")}
              onChange={(event) => change({ message: event.target.value || null }, "start")}
              className="resize-none rounded-xl border border-input bg-card px-3 py-2.5 text-[15px] outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>

          <div className="flex flex-col divide-y divide-border">
            <Toggle
              label={t.askKm}
              hint={t.askKmHint}
              on={settings.askKm}
              onChange={(askKm) => change({ askKm }, "back")}
            />
            <Toggle
              label={t.allowSkip}
              hint={t.allowSkipHint}
              on={settings.allowSkip}
              onChange={(allowSkip) => change({ allowSkip }, "stop")}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[15px] font-semibold">{t.notifyTitle}</span>
            <div className="flex flex-col divide-y divide-border">
              <Toggle
                label={t.notifyStart}
                on={settings.notify.start}
                onChange={(start) => change({ notify: { ...settings.notify, start } }, "start")}
              />
              <Toggle
                label={t.notifyEach}
                on={settings.notify.eachMachine}
                onChange={(eachMachine) => change({ notify: { ...settings.notify, eachMachine } }, "stop")}
              />
              <Toggle
                label={t.notifyFinish}
                on={settings.notify.finish}
                onChange={(finish) => change({ notify: { ...settings.notify, finish } }, "finish")}
              />
            </div>
            <Link href="/settings" className="mt-1 text-[13px] text-muted-foreground underline underline-offset-2">
              {t.notifyHint}
            </Link>
          </div>

          <div className="flex flex-col gap-2">
            <Button size="lg" onClick={save} disabled={!dirty || pending}>
              {pending ? m.common.saving : m.common.save}
            </Button>
            {justSaved && !dirty && (
              <p className="flex items-center gap-1.5 text-[13.5px] font-medium text-positive">
                <Check className="size-4" />
                {t.saved}
              </p>
            )}
            {error && <p className="text-[13.5px] font-medium text-negative">{m.common.error}</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}

const stepKey = (step: Step) =>
  (({ plan: "stepPlan", pick: "stepPick", start: "stepStart", stop: "stepStop", back: "stepBack", finish: "stepFinish" }) as const)[
    step
  ];

/** The six steps in a row, joined by a line that fills in as the round goes, with the machine step branching into what happens there. */
function RoundMap({
  active,
  playing,
  settings,
  onPick,
}: {
  active: number;
  playing: boolean;
  settings: RoundSettings;
  onPick: (index: number) => void;
}) {
  const { m } = useI18n();
  const t = m.workflow;
  const list = useRef<HTMLOListElement>(null);
  const leaves = [t.leafSlots, t.leafReport, ...(settings.allowSkip ? [t.leafSkip] : []), ...settings.checks];

  // On a narrow screen the map scrolls sideways: keep the current step in view without moving the page.
  useEffect(() => {
    const ol = list.current;
    const item = ol?.children[active] as HTMLElement | undefined;
    if (!ol || !item || ol.scrollWidth <= ol.clientWidth) return;
    ol.scrollTo({ left: item.offsetLeft - (ol.clientWidth - item.offsetWidth) / 2, behavior: "smooth" });
  }, [active]);

  return (
    <ol ref={list} className="relative -mx-1 flex items-start overflow-x-auto px-1 pb-2">
      {STEPS.map((step, index) => {
        const Icon = step.icon;
        const passed = index < active;
        const current = index === active;
        return (
          <li
            key={step.key}
            className={cn(
              "relative flex flex-col items-center",
              step.key === "stop" ? "min-w-[150px] flex-[1.6_1_0%]" : "min-w-[84px] flex-[1_1_0%]",
            )}
          >
            {index > 0 && <Line side="before" done={index <= active} />}
            {index < STEPS.length - 1 && <Line side="after" done={passed} />}
            <button
              type="button"
              onClick={() => onPick(index)}
              aria-current={current ? "step" : undefined}
              className="group relative flex flex-col items-center gap-2 px-1 text-center"
            >
              <span className="relative grid size-14 place-items-center rounded-full bg-card">
                {current && playing && <span className="absolute inset-0 animate-ping rounded-full bg-foreground/15" />}
                <span
                  className={cn(
                    "relative grid size-14 place-items-center rounded-full transition-all duration-300 [&_svg]:size-6",
                    current
                      ? "scale-105 bg-foreground text-background shadow-[0_10px_24px_-10px_rgb(0_0_0/0.5)]"
                      : passed
                        ? "bg-positive/15 text-positive"
                        : "bg-surface text-muted-foreground group-hover:text-foreground",
                  )}
                >
                  {passed ? <Check strokeWidth={2.6} /> : <Icon />}
                </span>
              </span>
              <span className={cn("text-[13.5px] font-semibold leading-tight", !current && "text-muted-foreground")}>
                {t[stepKey(step.key)]}
              </span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  step.who === "you" ? "bg-primary/12 text-[#8a6117]" : "bg-surface text-muted-foreground",
                )}
              >
                {step.who === "you" ? t.you : t.filler}
              </span>
            </button>
            {step.key === "stop" && (
              <ul className="mt-3 flex w-full flex-col gap-1.5 border-l-2 border-dashed border-border pl-3">
                {leaves.map((leaf, i) => (
                  <li
                    key={`${leaf}-${i}`}
                    className={cn(
                      "w-fit max-w-full truncate rounded-full px-2.5 py-1 text-[11.5px] font-medium animate-in fade-in zoom-in-95",
                      i >= leaves.length - settings.checks.length ? "bg-primary/12 text-[#8a6117]" : "bg-surface text-muted-foreground",
                    )}
                  >
                    {leaf}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Half of the line between two steps, drawn behind them; it fills in green once that part of the round is walked. */
function Line({ side, done }: { side: "before" | "after"; done: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute top-[27px] border-t-2 border-dashed border-border",
        side === "before" ? "left-0 right-1/2" : "left-1/2 right-0",
      )}
    >
      <span
        className={cn(
          "absolute -top-0.5 left-0 h-0.5 bg-positive transition-[width] duration-300 ease-out",
          done ? "w-full" : "w-0",
          side === "before" && done && "delay-300",
        )}
      />
    </span>
  );
}

function Phone({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-[260px] rounded-[38px] border-[7px] border-[#1d1b19] bg-background p-3 shadow-[0_24px_60px_-28px_rgb(0_0_0/0.45)]">
      <div className="mx-auto mb-3 h-[18px] w-20 rounded-full bg-[#1d1b19]" />
      <div className="flex h-[440px] flex-col gap-2.5 overflow-hidden px-1 text-[12px]">{children}</div>
    </div>
  );
}

type Names = { filler: string; hello: string; machines: string[]; products: string[] };

function MiniTick({ done }: { done: boolean }) {
  return (
    <span
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-full border-2",
        done ? "border-positive bg-positive text-background" : "border-border bg-card",
      )}
    >
      {done && <Check className="size-3" strokeWidth={3.2} />}
    </span>
  );
}

function MiniButton({ children }: { children: React.ReactNode }) {
  return (
    <span className="mt-auto flex h-10 items-center justify-center rounded-xl bg-foreground text-[13px] font-semibold text-background">
      {children}
    </span>
  );
}

/** A small, faithful sketch of the filler's screen at each step. */
function FillerScreen({ step, settings, names }: { step: Step; settings: RoundSettings; names: Names }) {
  const { m } = useI18n();
  const r = m.round;
  const t = m.workflow;
  const [first, second, third] = names.machines;
  const message = settings.message && (
    <div className="flex gap-2 rounded-xl bg-primary/10 px-2.5 py-2">
      <MessageSquareText className="mt-0.5 size-3.5 shrink-0 text-[#8a6117]" />
      <div className="min-w-0">
        <p className="text-[10.5px] font-semibold text-[#8a6117]">{r.messageTitle}</p>
        <p className="line-clamp-3 text-[11.5px] leading-snug">{settings.message}</p>
      </div>
    </div>
  );

  if (step === "plan") {
    return (
      <>
        <VendlyWordmark className="h-4 w-auto text-[#2a2520]" />
        <p className="text-[17px] font-bold tracking-[-0.02em]">{t.demoReady}</p>
        {[first, second, third].map((name, i) => (
          <div key={name} className="flex items-center gap-2 rounded-xl bg-card px-2.5 py-2 ring-1 ring-border">
            <span className="grid size-6 place-items-center rounded-full bg-surface text-[11px] font-bold">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate font-semibold">{name}</span>
            <span className="text-muted-foreground">{fmt(r.pieces, { n: [8, 5, 6][i] })}</span>
          </div>
        ))}
        <MiniButton>{r.beginPicking}</MiniButton>
      </>
    );
  }
  if (step === "pick") {
    return (
      <>
        <p className="text-[17px] font-bold tracking-[-0.02em]">{r.pickTitle}</p>
        <p className="text-muted-foreground">{r.pickHint}</p>
        {names.products.map((product, i) => (
          <div key={`${product}-${i}`} className="flex items-center gap-2 rounded-xl bg-card px-2.5 py-2 ring-1 ring-border">
            <MiniTick done={i < 2} />
            <span className={cn("min-w-0 flex-1 truncate font-semibold", i < 2 && "text-muted-foreground")}>{product}</span>
            <span className="tabular font-bold">{[4, 3, 2, 6][i]}</span>
          </div>
        ))}
        <MiniButton>{r.start}</MiniButton>
      </>
    );
  }
  if (step === "start") {
    return (
      <>
        <p className="text-[17px] font-bold tracking-[-0.02em]">{names.hello}</p>
        <div className="flex items-center gap-2 rounded-xl bg-foreground px-3 py-2 text-background">
          <Timer className="size-4" />
          <span className="tabular text-[20px] font-bold tracking-[-0.03em]">0:12:34</span>
        </div>
        {message}
        <p className="pt-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{r.routeTitle}</p>
        {[r.pickTitle, first, second, third].map((name, i) => (
          <div key={`${name}-${i}`} className="flex items-center gap-2">
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full text-[10.5px] font-bold",
                i === 0 ? "bg-positive text-background" : i === 1 ? "bg-foreground text-background" : "border-2 border-border text-muted-foreground",
              )}
            >
              {i === 0 ? <Check className="size-3" strokeWidth={3} /> : i + 1}
            </span>
            <span className={cn("min-w-0 flex-1 truncate font-semibold", i === 0 && "text-muted-foreground")}>{name}</span>
            {i === 1 && <span className="rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-bold text-background">{r.now}</span>}
          </div>
        ))}
      </>
    );
  }
  if (step === "stop") {
    return (
      <>
        <p className="text-[11px] font-semibold text-muted-foreground">{fmt(r.stopOf, { n: 1, total: 3 })}</p>
        <p className="truncate text-[17px] font-bold tracking-[-0.02em]">{first}</p>
        <div className="flex flex-wrap gap-1.5">
          <span className="flex items-center gap-1 rounded-full bg-card px-2 py-1 text-[11px] font-semibold ring-1 ring-border">
            <TriangleAlert className="size-3 text-warning" />
            {r.reportShort}
          </span>
          {settings.allowSkip && (
            <span className="rounded-full bg-card px-2 py-1 text-[11px] font-semibold ring-1 ring-border">{r.skipShort}</span>
          )}
        </div>
        {names.products.slice(0, 3).map((product, i) => (
          <div key={`${product}-${i}`} className="flex items-center gap-2 border-b border-border/60 pb-1.5">
            <MiniTick done={i < 2} />
            <span className="rounded-md bg-surface px-1 font-mono text-[10.5px] font-semibold">{11 + i * 2}</span>
            <span className={cn("min-w-0 flex-1 truncate font-semibold", i < 2 && "text-muted-foreground")}>{product}</span>
            <span className="tabular rounded-lg bg-surface px-1.5 py-0.5 font-bold">+{[2, 1, 2][i]}</span>
          </div>
        ))}
        {settings.checks.length > 0 && (
          <>
            <p className="pt-1 font-semibold">{r.checksTitle}</p>
            {settings.checks.slice(0, 4).map((check, i) => (
              <div key={check} className="flex items-center gap-2 animate-in fade-in slide-in-from-left-1">
                <MiniTick done={i === 0} />
                <span className={cn("min-w-0 flex-1 truncate font-semibold", i === 0 && "text-muted-foreground")}>{check}</span>
              </div>
            ))}
          </>
        )}
        <MiniButton>{fmt(r.doneWith, { machine: first })}</MiniButton>
      </>
    );
  }
  if (step === "back") {
    return (
      <>
        <p className="text-[17px] font-bold tracking-[-0.02em]">{r.roundDone}</p>
        <p className="text-muted-foreground">{fmt(r.machinesDone, { n: 3 })}</p>
        <p className="pt-1 font-semibold">{r.stillWithYou}</p>
        {names.products.slice(0, 2).map((product, i) => (
          <div key={`${product}-${i}`} className="flex items-center gap-2 rounded-xl bg-card px-2.5 py-2 ring-1 ring-border">
            <span className="min-w-0 flex-1 truncate font-semibold">{product}</span>
            <span className="tabular font-bold">{i + 1}</span>
            <span className="rounded-lg bg-surface px-1.5 py-1 text-[10.5px] font-semibold">{i === 0 ? r.dispStock : r.dispWaste}</span>
          </div>
        ))}
        {settings.askKm && (
          <div className="flex items-center gap-2 rounded-xl bg-card px-2.5 py-2 ring-1 ring-border animate-in fade-in">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{m.refill.kmLabel}</span>
              <span className="block text-[10.5px] text-muted-foreground">{r.kmOptional}</span>
            </span>
            <span className="tabular rounded-lg bg-surface px-2 py-1 font-bold">38</span>
          </div>
        )}
        <MiniButton>{r.finish}</MiniButton>
      </>
    );
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-foreground text-background">
        <Check className="size-7" strokeWidth={2.6} />
      </span>
      <p className="text-[22px] font-bold tracking-[-0.03em]">{r.thanks}</p>
      <p className="text-muted-foreground">{fmt(r.thanksSummary, { machines: 3, filled: 38, removed: 1, back: 1 })}</p>
      <p className="font-semibold">{fmt(r.took, { time: "1 u 12 min" })}</p>
    </div>
  );
}

/** A phone notification, as the operator gets it. */
function Bubble({ text }: { text: string }) {
  const { m } = useI18n();
  return (
    <div className="flex items-start gap-2.5 rounded-2xl bg-card/90 px-3 py-2.5 shadow-[0_8px_24px_-12px_rgb(0_0_0/0.35)] ring-1 ring-border backdrop-blur animate-in fade-in slide-in-from-top-3 duration-500">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#F4F1EA]">
        <VendlyMark className="h-4 w-auto" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex justify-between text-[12px] font-semibold">
          {m.brand.name} <span className="font-normal text-muted-foreground">{m.workflow.demoNow}</span>
        </span>
        <span className="block text-[13px] leading-snug">{text}</span>
      </span>
    </div>
  );
}

function Quiet() {
  const { m } = useI18n();
  return <p className="rounded-2xl border border-dashed border-border px-3 py-2.5 text-[12.5px] text-muted-foreground">{m.workflow.notifyOff}</p>;
}

/** A small, faithful sketch of what the operator sees at each step. */
function OwnerScreen({ step, settings, names, cost }: { step: Step; settings: RoundSettings; names: Names; cost: string }) {
  const { m } = useI18n();
  const r = m.refill;
  const t = m.workflow;
  const [first, second, third] = names.machines;
  const live = (done: number, packing = false) => (
    <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-border">
      <div className="flex items-start gap-2">
        <span className="relative mt-1.5 flex size-2.5 shrink-0">
          {!packing && <span className="absolute inline-flex size-full animate-ping rounded-full bg-positive opacity-60" />}
          <span className={cn("relative inline-flex size-2.5 rounded-full", packing ? "bg-warning" : "bg-positive")} />
        </span>
        <span className="text-[14.5px] font-semibold leading-snug">
          {packing ? fmt(r.livePacking, { count: 3 }) : fmt(r.liveFilling, { name: names.filler })}
        </span>
      </div>
      {!packing && <span className="tabular text-[26px] font-semibold leading-none tracking-[-0.03em]">0:{done ? "34:10" : "12:34"}</span>}
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn("h-1.5 flex-1 rounded-full", i < done ? "bg-positive" : i === done && !packing ? "bg-foreground" : "bg-border")}
          />
        ))}
      </div>
      <p className="text-[13px]">
        <b>{fmt(r.liveProgress, { done, total: 3 })}</b>
        {!packing && ` · ${fmt(r.liveNow, { machine: [first, second, third][done] ?? third })}`}
      </p>
    </div>
  );

  if (step === "plan") {
    return (
      <div className="flex flex-col gap-2 rounded-2xl bg-card p-4 ring-1 ring-border">
        <p className="text-[14.5px] font-semibold">{m.refill.title}</p>
        {[first, second, third].map((name) => (
          <div key={name} className="flex items-center gap-2 text-[13px]">
            <MiniTick done />
            <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
          </div>
        ))}
      </div>
    );
  }
  if (step === "pick") return live(0, true);
  if (step === "start") {
    return (
      <>
        {settings.notify.start ? (
          <Bubble text={fmt(m.round.pushStarted, { name: names.filler, count: 3 })} />
        ) : (
          <Quiet />
        )}
        {live(0)}
      </>
    );
  }
  if (step === "stop") {
    return (
      <>
        {settings.notify.eachMachine ? <Bubble text={fmt(m.round.pushStopDone, { name: names.filler, machine: first })} /> : <Quiet />}
        {live(1)}
        {settings.checks.length > 0 && (
          <p className="rounded-2xl bg-card px-3 py-2.5 text-[12.5px] ring-1 ring-border animate-in fade-in">
            <b>{first}</b> · {fmt(r.checksDone, { done: settings.checks.length, total: settings.checks.length })}
          </p>
        )}
      </>
    );
  }
  if (step === "back") {
    return (
      <div className="flex flex-col gap-2 rounded-2xl bg-card p-4 ring-1 ring-border">
        <p className="flex items-center justify-between text-[13.5px]">
          {m.round.dispStock} <b className="tabular">1</b>
        </p>
        <p className="flex items-center justify-between text-[13.5px]">
          {m.round.dispWaste} <b className="tabular">1</b>
        </p>
      </div>
    );
  }
  return (
    <>
      {settings.notify.finish ? <Bubble text={fmt(m.round.pushDone, { name: names.filler, count: 3, minutes: 72 })} /> : <Quiet />}
      <div className="flex flex-col gap-1.5 rounded-2xl bg-card p-4 ring-1 ring-border">
        <p className="text-[14.5px] font-semibold">{t.demoReport}</p>
        <p className="text-[13px] text-muted-foreground">{fmt(t.demoFilled, { n: 38 })}</p>
        <p className="text-[13px] text-muted-foreground">{fmt(t.demoBack, { n: 1 })}</p>
        <p className="tabular pt-1 text-[22px] font-semibold tracking-[-0.03em]">{fmt(t.demoCost, { cost })}</p>
      </div>
    </>
  );
}

/** The operator's own checks: add, reorder, remove, or take a suggestion. */
function ChecksEditor({
  checks,
  onChange,
  onFocus,
}: {
  checks: string[];
  onChange: (checks: string[]) => void;
  onFocus: () => void;
}) {
  const { m } = useI18n();
  const t = m.workflow;
  const [draft, setDraft] = useState("");
  const full = checks.length >= MAX_CHECKS;
  const has = (label: string) => checks.some((check) => check.toLocaleLowerCase() === label.toLocaleLowerCase());
  const add = (label: string) => {
    const clean = label.replace(/\s+/g, " ").trim().slice(0, MAX_CHECK_LENGTH);
    if (!clean || has(clean) || full) return;
    onChange([...checks, clean]);
    setDraft("");
  };
  const move = (index: number, by: number) => {
    const next = [...checks];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[15px] font-semibold">{t.checksLabel}</span>
      <span className="-mt-1 text-[13px] text-muted-foreground">{t.checksHint}</span>
      {checks.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {checks.map((check, index) => (
            <li key={check} className="flex items-center gap-1 rounded-xl bg-surface py-1 pl-3 pr-1 animate-in fade-in">
              <Check className="size-4 shrink-0 text-positive" />
              <span className="min-w-0 flex-1 truncate px-1 text-[14px] font-medium">{check}</span>
              <IconButton label={t.checksUp} disabled={index === 0} onClick={() => move(index, -1)}>
                <ArrowUp />
              </IconButton>
              <IconButton label={t.checksDown} disabled={index === checks.length - 1} onClick={() => move(index, 1)}>
                <ArrowDown />
              </IconButton>
              <IconButton label={t.checksRemove} onClick={() => onChange(checks.filter((_, i) => i !== index))}>
                <X />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      {full ? (
        <p className="text-[13px] text-muted-foreground">{t.checksFull}</p>
      ) : (
        <>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              add(draft);
            }}
          >
            <Input
              value={draft}
              maxLength={MAX_CHECK_LENGTH}
              placeholder={t.checksPlaceholder}
              onFocus={onFocus}
              onChange={(event) => setDraft(event.target.value)}
            />
            <Button type="submit" variant="secondary" size="icon" aria-label={t.checksAdd} title={t.checksAdd} disabled={!draft.trim()}>
              <Plus />
            </Button>
          </form>
          <div className="flex flex-wrap gap-1.5">
            {t.suggestions
              .filter((suggestion) => !has(suggestion))
              .map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => add(suggestion)}
                  className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-border px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
                >
                  <Plus className="size-3.5" />
                  {suggestion}
                </button>
              ))}
          </div>
        </>
      )}
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-card hover:text-foreground disabled:opacity-30 [&_svg]:size-4"
    >
      {children}
    </button>
  );
}

/** An on/off switch with its label, the size of a thumb. */
function Toggle({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex min-h-14 w-full items-center gap-3 py-2.5 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-medium">{label}</span>
        {hint && <span className="block text-[13px] text-muted-foreground">{hint}</span>}
      </span>
      <span
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200",
          on ? "bg-positive" : "bg-border",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-6 rounded-full bg-white shadow-sm transition-transform duration-200",
            on ? "translate-x-[22px]" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}
