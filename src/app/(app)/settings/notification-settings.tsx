"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  CalendarRange,
  Mail,
  MessageSquare,
  Moon,
  PackageOpen,
  Send,
  ShoppingBag,
  Smartphone,
} from "lucide-react";
import { Avatar } from "@/components/list-row";
import { SavedCheck } from "@/components/saved-check";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { intlLocale } from "@/i18n/config";
import type { NotificationSettings as Settings, SentNotification } from "@/lib/data";
import { LOW_PERCENTS, NOTIFY_CHANNELS, type NotifyChannel, type NotifyPrefs, type NotifyTopic } from "@/lib/notify-prefs";
import { cn } from "@/lib/utils";
import { saveNotifications, testNotifications } from "./actions";
import { NotifyToggle } from "./notify-toggle";
import { PrefRow, Switch, selectClass } from "./preference-controls";

/** How long the big green check stays; a tap closes it sooner. */
const CHECK_MS = 2000;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const ICON: Record<NotifyChannel, React.ComponentType<{ className?: string }>> = { push: Bell, email: Mail, sms: MessageSquare };

type Problem = "email" | "phone" | "emailMissing" | "phoneMissing";

/**
 * Meldingen (23-10-2026, Xin: "put notifications on and send them on email or sms and also filter what they
 * notifications about such as one time per day a overview or every sale or if error"): where messages go, and per
 * topic on which of them. Stored per person; supabase/functions/vendly-alerts sends them. Nothing is stored before
 * "save"; a test saves first, so it shows what was chosen.
 */
export function NotificationSettings({ settings, shop, pushKey }: { settings: Settings; shop: boolean; pushKey: string | undefined }) {
  const { m, f, locale } = useI18n();
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  // Before anything was chosen, mail goes to the address one signs in with.
  const start: NotifyPrefs = settings.chosen ? settings.prefs : { ...settings.prefs, email: settings.prefs.email ?? settings.loginEmail };
  const [saved, setSaved] = useState<NotifyPrefs>(start);
  const [prefs, setPrefs] = useState<NotifyPrefs>(start);
  const [chosen, setChosen] = useState(settings.chosen);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [test, setTest] = useState<"done" | "wait" | "failed" | null>(null);
  const [check, setCheck] = useState(false);
  useEffect(() => {
    if (!check) return;
    const timer = window.setTimeout(() => setCheck(false), CHECK_MS);
    return () => window.clearTimeout(timer);
  }, [check]);

  const dirty = !chosen || JSON.stringify(prefs) !== JSON.stringify(saved);
  const hour = (h: number) =>
    new Intl.DateTimeFormat(intlLocale[locale], { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(2000, 0, 1, h)));
  const pct = (n: number) => fmt(m.prefs.percent, { n });
  const channelName: Record<NotifyChannel, string> = { push: m.prefs.channelPush, email: m.prefs.channelEmail, sms: m.prefs.channelSms };

  function change(next: Partial<NotifyPrefs>) {
    setPrefs((current) => ({ ...current, ...next }));
    setProblem(null);
    setTest(null);
  }

  function toggle(topic: NotifyTopic, channel: NotifyChannel) {
    setPrefs((current) => {
      const list = current.topics[topic];
      const next = list.includes(channel) ? list.filter((c) => c !== channel) : NOTIFY_CHANNELS.filter((c) => c === channel || list.includes(c));
      return { ...current, topics: { ...current.topics, [topic]: next } };
    });
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
      router.refresh();
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

  const problemText: Record<Problem, string> = {
    email: m.prefs.emailInvalid,
    phone: m.prefs.phoneInvalid,
    emailMissing: m.prefs.emailMissing,
    phoneMissing: m.prefs.phoneMissing,
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Where to: this device, an address, a number. */}
      <div className="surface-card flex flex-col p-2">
        <p className="px-3 pb-1 pt-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{m.prefs.where}</p>
        {pushKey ? (
          <NotifyToggle publicKey={pushKey} known={settings.devices} />
        ) : (
          <p className="px-3 py-3 text-[14px] text-muted-foreground">{m.settings.notifyUnsupported}</p>
        )}
        <p className="px-3 pb-2 text-[13px] text-muted-foreground sm:pl-[66px]">
          {settings.devices === 0
            ? m.prefs.devicesNone
            : settings.devices === 1
              ? m.prefs.devicesOne
              : fmt(m.prefs.devices, { n: settings.devices })}
        </p>
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
        </Field>
        <Field
          id="notify-phone"
          icon={<Smartphone />}
          label={m.prefs.phone}
          hint={m.prefs.phoneHint}
          notReady={settings.ready.sms ? null : m.prefs.notReady}
          invalid={problem === "phone" || problem === "phoneMissing"}
        >
          <Input
            id="notify-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder={m.prefs.phonePlaceholder}
            value={prefs.phone ?? ""}
            onChange={(e) => change({ phone: e.target.value })}
            aria-invalid={problem === "phone" || problem === "phoneMissing"}
          />
        </Field>
      </div>

      {/* What about, and on which of them. */}
      <div className="surface-card flex flex-col p-2">
        <p className="px-3 pb-1 pt-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{m.prefs.what}</p>
        {topics.map(({ topic, icon, title, hint, extra }) => (
          <div key={topic} className="flex flex-col gap-3 rounded-xl px-3 py-3">
            <div className="flex min-w-0 items-center gap-3.5">
              <Avatar tone={prefs.topics[topic].length ? "positive" : "neutral"}>{icon}</Avatar>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold tracking-[-0.01em]">{title}</p>
                <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{hint}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pl-[54px]">
              {NOTIFY_CHANNELS.map((channel) => {
                const Icon = ICON[channel];
                const on = prefs.topics[topic].includes(channel);
                return (
                  <button
                    key={channel}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(topic, channel)}
                    className={cn(
                      "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13.5px] font-semibold transition-colors",
                      on ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                    {channelName[channel]}
                  </button>
                );
              })}
              {extra && <span className="basis-full sm:ml-2 sm:basis-auto">{extra}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Quiet hours: the night stays quiet for push and text messages. */}
      <div className="surface-card flex flex-col p-2">
        <PrefRow
          inline
          icon={<Moon />}
          title={m.prefs.quiet}
          hint={m.prefs.quietHint}
          control={<Switch on={prefs.quiet} onChange={(quiet) => change({ quiet })} label={m.prefs.quiet} />}
        />
        {prefs.quiet && (
          <div className="flex flex-wrap items-center gap-2 px-3 pb-3 pl-[66px] text-[14px] text-muted-foreground">
            {m.prefs.quietFrom}
            <select
              aria-label={m.prefs.quietFrom}
              value={prefs.quietFrom}
              onChange={(e) => change({ quietFrom: Number(e.target.value) })}
              className={selectClass}
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {hour(h)}
                </option>
              ))}
            </select>
            {m.prefs.quietTo}
            <select
              aria-label={m.prefs.quietTo}
              value={prefs.quietTo}
              onChange={(e) => change({ quietTo: Number(e.target.value) })}
              className={selectClass}
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {hour(h)}
                </option>
              ))}
            </select>
          </div>
        )}
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
        {test && (
          <p role="status" className={cn("px-1 text-[14px]", test === "done" ? "text-positive" : "text-negative")}>
            {test === "done" ? m.prefs.testDone : test === "wait" ? m.prefs.testWait : m.prefs.testFailed}
          </p>
        )}
      </div>

      <Recent recent={settings.recent} channelName={channelName} when={(iso) => f.dateTime(iso)} />

      {check && <SavedCheck text={m.prefs.savedCheck} onClose={() => setCheck(false)} />}
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

const KIND_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  daily: CalendarDays,
  weekly: CalendarRange,
  sale: ShoppingBag,
  low: PackageOpen,
  test: Send,
};

/** The last messages, and per channel how each went: the honest answer to "did it work?". */
function Recent({
  recent,
  channelName,
  when,
}: {
  recent: SentNotification[];
  channelName: Record<NotifyChannel, string>;
  when: (iso: string) => string;
}) {
  const { m } = useI18n();
  const status: Record<string, string> = {
    sent: m.prefs.statusSent,
    quiet: m.prefs.statusQuiet,
    no_device: m.prefs.statusNoDevice,
    no_address: m.prefs.statusNoAddress,
    no_number: m.prefs.statusNoNumber,
    no_provider: m.prefs.statusNoProvider,
    failed: m.prefs.statusFailed,
  };
  return (
    <div className="flex flex-col gap-2">
      <p className="px-1 text-[15px] font-semibold tracking-[-0.01em]">{m.prefs.recent}</p>
      {recent.length === 0 ? (
        <p className="surface-card px-4 py-3 text-[14px] text-muted-foreground">{m.prefs.recentEmpty}</p>
      ) : (
        <ul className="surface-card flex flex-col p-2">
          {recent.map((item) => {
            const Icon = KIND_ICON[item.kind] ?? AlertTriangle;
            return (
              <li key={item.id} className="flex gap-3.5 rounded-xl px-3 py-3">
                <Avatar>
                  <Icon />
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-semibold tracking-[-0.01em]">{item.title}</p>
                  <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{item.body}</p>
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px]">
                    <span className="text-muted-foreground">{when(item.at)}</span>
                    {NOTIFY_CHANNELS.filter((channel) => item.sent[channel]).map((channel) => (
                      <span key={channel} className={item.sent[channel] === "sent" ? "text-positive" : "text-muted-foreground"}>
                        {channelName[channel]}: {status[item.sent[channel]!] ?? item.sent[channel]}
                      </span>
                    ))}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
