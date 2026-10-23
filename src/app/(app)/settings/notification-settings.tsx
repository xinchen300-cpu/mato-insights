"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarDays, Eye, CalendarRange, Mail, PackageOpen, Send, ShoppingBag } from "lucide-react";
import { Avatar } from "@/components/list-row";
import { SavedCheck } from "@/components/saved-check";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { intlLocale } from "@/i18n/config";
import type { NotificationSettings as Settings, SentNotification } from "@/lib/data";
import { LOW_PERCENTS, NOTIFY_CHANNELS, type NotifyChannel, type NotifyPrefs, type NotifyTopic } from "@/lib/notify-prefs";
import { cn } from "@/lib/utils";
import { previewEmail, saveNotifications, testNotifications } from "./actions";
import { Switch, selectClass } from "./preference-controls";

/** How long the big green check stays; a tap closes it sooner. */
const CHECK_MS = 2000;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

type Problem = "email" | "emailMissing";

/**
 * Meldingen (23-10-2026, Xin: "put notifications on and send them on email or sms and also filter what they
 * notifications about such as one time per day a overview or every sale or if error"): where messages go, and per
 * topic on or off. Email only: push went the same day (Xin: "remove push but focus more on email"), then sms ("i dont
 * wnat to activate sms"). Stored per person; supabase/functions/vendly-alerts sends them, and shows the email before
 * it is sent. Nothing is stored before "save"; a test saves first, so it shows what was chosen.
 */
export function NotificationSettings({ settings, shop }: { settings: Settings; shop: boolean }) {
  const { m, locale } = useI18n();
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  // Before anything was chosen, mail goes to the address one signs in with.
  const start: NotifyPrefs = settings.chosen ? settings.prefs : { ...settings.prefs, email: settings.prefs.email ?? settings.loginEmail };
  const [saved, setSaved] = useState<NotifyPrefs>(start);
  const [prefs, setPrefs] = useState<NotifyPrefs>(start);
  const [chosen, setChosen] = useState(settings.chosen);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [test, setTest] = useState<"done" | "wait" | "failed" | null>(null);
  // How each channel fared in the last test: a test that reached nobody says why, never just "sent".
  const [tested, setTested] = useState<SentNotification["sent"] | null>(null);
  const [check, setCheck] = useState(false);
  // The day's overview as it would arrive, shown in a window; null while closed.
  const [preview, setPreview] = useState<{ subject: string; html: string } | "loading" | "failed" | null>(null);
  useEffect(() => {
    if (!check) return;
    const timer = window.setTimeout(() => setCheck(false), CHECK_MS);
    return () => window.clearTimeout(timer);
  }, [check]);

  const dirty = !chosen || JSON.stringify(prefs) !== JSON.stringify(saved);
  const hour = (h: number) =>
    new Intl.DateTimeFormat(intlLocale[locale], { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(2000, 0, 1, h)));
  const pct = (n: number) => fmt(m.prefs.percent, { n });
  const channelName: Record<NotifyChannel, string> = { email: m.prefs.channelEmail };

  function change(next: Partial<NotifyPrefs>) {
    setPrefs((current) => ({ ...current, ...next }));
    setProblem(null);
    setTest(null);
  }

  function toggle(topic: NotifyTopic, on: boolean) {
    setPrefs((current) => ({ ...current, topics: { ...current.topics, [topic]: on ? [...NOTIFY_CHANNELS] : [] } }));
    setProblem(null);
    setTest(null);
  }

  /** Stores what is on screen; false when something in it has to be fixed first. */
  async function store(): Promise<boolean> {
    const result = await saveNotifications(prefs);
    if (!result.ok) {
      setProblem(result.reason);
      return false;
    }
    setSaved(prefs);
    setChosen(true);
    return true;
  }

  function save() {
    setTest(null);
    startTransition(async () => {
      if (!(await store())) return;
      setCheck(true);
      router.refresh();
    });
  }

  function sendTest() {
    setTest(null);
    startTransition(async () => {
      if (dirty && !(await store())) return;
      const result = await testNotifications();
      setTest(result.ok ? "done" : result.reason);
      setTested(result.ok ? result.sent : null);
      router.refresh();
    });
  }

  function showPreview() {
    setPreview("loading");
    startTransition(async () => {
      setPreview((await previewEmail().catch(() => null)) ?? "failed");
    });
  }

  const topics: { topic: NotifyTopic; icon: React.ReactNode; title: string; hint: string; extra?: React.ReactNode }[] = [
    {
      topic: "daily",
      icon: <CalendarDays />,
      title: m.prefs.daily,
      hint: `${m.prefs.dailyHint} ${m.prefs.dailyMorning}`,
      extra: (
        <label className="flex items-center gap-2 text-[14px] text-muted-foreground">
          {m.prefs.dailyAt}
          <select value={prefs.dailyHour} onChange={(e) => change({ dailyHour: Number(e.target.value) })} className={selectClass}>
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {hour(h)}
              </option>
            ))}
          </select>
        </label>
      ),
    },
    { topic: "weekly", icon: <CalendarRange />, title: m.prefs.weekly, hint: m.prefs.weeklyHint },
    { topic: "sales", icon: <ShoppingBag />, title: m.prefs.sales, hint: m.prefs.salesHint },
    { topic: "errors", icon: <AlertTriangle />, title: m.prefs.errors, hint: shop ? m.prefs.errorsHintShop : m.prefs.errorsHint },
    {
      topic: "low_stock",
      icon: <PackageOpen />,
      title: m.prefs.lowStock,
      hint: m.prefs.lowStockHint,
      extra: (
        <label className="flex items-center gap-2 text-[14px] text-muted-foreground">
          {m.prefs.lowStockAt}
          <select value={prefs.lowPercent} onChange={(e) => change({ lowPercent: Number(e.target.value) })} className={selectClass}>
            {LOW_PERCENTS.map((p) => (
              <option key={p} value={p}>
                {pct(p)}
              </option>
            ))}
          </select>
        </label>
      ),
    },
  ];

  const problemText: Record<Problem, string> = { email: m.prefs.emailInvalid, emailMissing: m.prefs.emailMissing };

  return (
    <div className="flex flex-col gap-4">
      {/* Where to. */}
      <div className="surface-card flex flex-col p-2">
        <p className="px-3 pb-1 pt-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{m.prefs.where}</p>
        <Field
          id="notify-email"
          icon={<Mail />}
          label={m.prefs.email}
          hint={m.prefs.emailHint}
          notReady={settings.ready.email ? null : m.prefs.notReady}
          invalid={problem === "email" || problem === "emailMissing"}
        >
          <Input
            id="notify-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={prefs.email ?? ""}
            onChange={(e) => change({ email: e.target.value })}
            aria-invalid={problem === "email" || problem === "emailMissing"}
          />
          <Button variant="secondary" onClick={showPreview} disabled={preview === "loading"} className="mt-1 self-start">
            <Eye />
            {preview === "loading" ? m.common.loading : m.prefs.previewEmail}
          </Button>
        </Field>
      </div>

      {/* What about: each on or off; the hour or the limit under it while it is on. */}
      <div className="surface-card flex flex-col p-2">
        <p className="px-3 pb-1 pt-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{m.prefs.what}</p>
        {topics.map(({ topic, icon, title, hint, extra }) => {
          const on = prefs.topics[topic].length > 0;
          return (
            <div key={topic} className="flex flex-col gap-2 rounded-xl px-3 py-3">
              <div className="flex items-center gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-3.5">
                  <Avatar tone={on ? "positive" : "neutral"}>{icon}</Avatar>
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold tracking-[-0.01em]">{title}</p>
                    <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{hint}</p>
                  </div>
                </div>
                <Switch on={on} onChange={(next) => toggle(topic, next)} label={title} />
              </div>
              {extra && on && <div className="pl-[54px]">{extra}</div>}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Button size="lg" onClick={save} disabled={busy || !dirty} className="grow sm:grow-0">
            {busy ? m.common.saving : m.prefs.save}
          </Button>
          <Button size="lg" variant="outline" onClick={sendTest} disabled={busy} className="grow sm:grow-0">
            <Send />
            {busy ? m.prefs.testing : m.prefs.test}
          </Button>
        </div>
        {dirty && chosen && !problem && <p className="px-1 text-[13px] text-muted-foreground">{m.prefs.unsaved}</p>}
        {problem && (
          <p role="alert" className="px-1 text-[14px] font-medium text-negative">
            {problemText[problem]}
          </p>
        )}
        {test === "done" && tested ? (
          <TestOutcome sent={tested} channelName={channelName} email={saved.email || settings.loginEmail || ""} />
        ) : (
          test && (
            <p role="status" className="px-1 text-[14px] text-negative">
              {test === "wait" ? m.prefs.testWait : m.prefs.testFailed}
            </p>
          )
        )}
      </div>

      {check && <SavedCheck text={m.prefs.savedCheck} onClose={() => setCheck(false)} />}

      <Dialog open={preview !== null && preview !== "loading"} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="gap-3 sm:max-w-2xl">
          <DialogTitle className="pr-8 text-[16px]">
            {typeof preview === "object" && preview ? preview.subject : m.prefs.previewEmail}
          </DialogTitle>
          {typeof preview === "object" && preview ? (
            <>
              <p className="text-[13px] text-muted-foreground">{fmt(m.prefs.previewTo, { email: prefs.email || settings.loginEmail || "" })}</p>
              {/* The mail itself, apart from the page: no scripts, its links open in a new tab. */}
              <iframe
                title={preview.subject}
                srcDoc={preview.html}
                sandbox="allow-popups allow-popups-to-escape-sandbox"
                className="h-[65dvh] w-full rounded-xl border bg-white"
              />
            </>
          ) : (
            <p className="text-[14px] text-negative">{m.prefs.previewFailed}</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** What a test did: where it went, or why it could not and what to do. */
function TestOutcome({ sent, channelName, email }: { sent: SentNotification["sent"]; channelName: Record<NotifyChannel, string>; email: string }) {
  const { m } = useI18n();
  const arrived = NOTIFY_CHANNELS.filter((channel) => sent[channel] === "sent");
  const reasons = NOTIFY_CHANNELS.filter((channel) => sent[channel] && sent[channel] !== "sent").map((channel) => {
    const status = sent[channel];
    if (status === "no_address") return m.prefs.reasonNoAddress;
    if (status === "no_provider") return fmt(m.prefs.reasonNoProvider, { channel: channelName[channel] });
    return fmt(m.prefs.reasonFailed, { channel: channelName[channel] });
  });
  return (
    <div role="status" className="flex flex-col gap-1 px-1 text-[14px] leading-snug">
      <p className={cn("font-medium", arrived.length ? "text-positive" : "text-negative")}>
        {arrived.length ? fmt(m.prefs.testArrived, { email }) : m.prefs.testNothing}
      </p>
      {reasons.map((reason) => (
        <p key={reason} className="text-muted-foreground">
          {reason}
        </p>
      ))}
    </div>
  );
}

function Field({
  id,
  icon,
  label,
  hint,
  notReady,
  invalid,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  label: string;
  hint: string;
  notReady: string | null;
  invalid: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3.5 rounded-xl px-3 py-3">
      <Avatar tone={invalid ? "negative" : "neutral"}>{icon}</Avatar>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <label htmlFor={id} className="text-[15px] font-semibold tracking-[-0.01em]">
          {label}
        </label>
        {children}
        <p className="text-[13px] leading-snug text-muted-foreground">{hint}</p>
        {notReady && <p className="text-[13px] leading-snug text-gold-ink">{notReady}</p>}
      </div>
    </div>
  );
}
