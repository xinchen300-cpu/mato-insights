// Instellingen → Meldingen (23-10-2026, Xin: "put notifications on and send them on email or sms and also filter what
// they notifications about such as one time per day a overview or every sale or if error"). Runs every minute
// (pg_cron) and tells each person what they asked for, on the channels they chose per topic: push to their own
// devices, e-mail (Resend: resend_api_key and mail_from in app_keys) and sms (Twilio: twilio_sid, twilio_token and
// twilio_from). Without those keys a channel is skipped and the log says why: nothing pretends to be sent.
//
// One problem is one message: a terminal offline, Payter failing and a machine almost empty each open an episode in
// notification_log and close it when it is over (offline and Payter then say so). A message that reached nobody
// (quiet hours) opens nothing, so it is told after them if the problem is still there. Sales during quiet hours are
// skipped, never told in a heap the next morning.
//
// POST {"test": {"user_id", "org_id"}} sends one test message at once, for "Stuur een test" in Instellingen.
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ZONE = "Europe/Brussels";
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** Payter reconnects each terminal once a night; this keeps that from raising an alarm (as terminalStatus). */
const GRACE_MS = 10 * MINUTE;
/** An outage older than this is known by now: switching errors on does not dig it up. */
const FRESH_MS = 24 * HOUR;
/** Payter is asked every 15 seconds; a quarter of an hour without one that worked is no hiccup. */
const SYNC_DOWN_MS = 15 * MINUTE;
/** A machine almost empty is told again only once it was filled past the limit plus this. */
const LOW_MARGIN = 10;

type Channel = "push" | "email" | "sms";
type Locale = "nl" | "fr" | "en";
type Prefs = {
  user_id: string;
  org_id: string;
  business_id: string | null;
  locale: Locale;
  email: string | null;
  phone: string | null;
  daily: Channel[];
  weekly: Channel[];
  sales: Channel[];
  errors: Channel[];
  low_stock: Channel[];
  daily_hour: number;
  low_percent: number;
  quiet: boolean;
  quiet_from: number;
  quiet_to: number;
  sales_seen_at: string | null;
  daily_sent_on: string | null;
  weekly_sent_on: string | null;
};
type Message = { kind: string; key?: string | null; title: string; body: string; url: string; tag: string };
type Outcome = Partial<Record<Channel, string>>;
type ScopeMachine = {
  machine_id: string;
  machine_name: string;
  refill_manual: boolean;
  last_connected_at: string | null;
  last_disconnected_at: string | null;
};
type Episode = { id: string; kind: string; key: string | null; created_at: string };

const INTL: Record<Locale, string> = { nl: "nl-BE", fr: "fr-BE", en: "en-GB" };

const TEXT = {
  nl: {
    sales: (n: number) => (n === 1 ? "1 verkoop" : `${n} verkopen`),
    slot: (s: string | null) => `vak ${s ?? "?"}`,
    today: "Vandaag",
    yesterday: "Gisteren",
    lastWeek: "Vorige week",
    noSalesYet: "Nog geen verkoop",
    noSales: "Geen verkoop",
    best: (name: string, money: string) => `beste: ${name} (${money})`,
    low: (n: number, p: string) => (n === 1 ? `1 automaat onder ${p}` : `${n} automaten onder ${p}`),
    offlineCount: (n: number) => (n === 1 ? "1 terminal offline" : `${n} terminals offline`),
    expired: (n: number) => (n === 1 ? "1 stuk over datum" : `${n} stuks over datum`),
    offlineTitle: (m: string) => `${m} is offline`,
    offlineBody: (t: string) => `Sinds ${t} is de betaalterminal niet verbonden: met de kaart betalen lukt nu niet.`,
    onlineTitle: (m: string) => `${m} is weer online`,
    onlineBody: (from: string, to: string) => `De betaalterminal was offline van ${from} tot ${to}.`,
    syncTitle: "Payter-koppeling werkt niet",
    syncBody: (t: string, account: string | null) =>
      `Sinds ${t} komen er geen nieuwe verkopen binnen${account ? ` van ${account}` : ""}. Kijk bij Instellingen → Payter.`,
    syncOkTitle: "Payter-koppeling werkt weer",
    syncOkBody: "Nieuwe verkopen komen weer binnen.",
    failedTitle: (n: number, m: string) => `${n} betalingen mislukt · ${m}`,
    failedBody: "In het laatste uur. Kijk of de betaalterminal goed werkt.",
    lowTitle: (m: string) => `${m} is bijna leeg`,
    lowBody: (p: string, limit: string) => `Nog ${p} gevuld, onder je grens van ${limit}.`,
    testTitle: "Testmelding",
    testBody: (summary: string) => `Zo komen je meldingen binnen. ${summary}`,
    why: "Je krijgt dit bericht omdat je het aanzette bij Instellingen → Meldingen.",
  },
  fr: {
    sales: (n: number) => (n === 1 ? "1 vente" : `${n} ventes`),
    slot: (s: string | null) => `case ${s ?? "?"}`,
    today: "Aujourd'hui",
    yesterday: "Hier",
    lastWeek: "Semaine dernière",
    noSalesYet: "Pas encore de vente",
    noSales: "Aucune vente",
    best: (name: string, money: string) => `meilleur : ${name} (${money})`,
    low: (n: number, p: string) => (n === 1 ? `1 distributeur sous ${p}` : `${n} distributeurs sous ${p}`),
    offlineCount: (n: number) => (n === 1 ? "1 terminal hors ligne" : `${n} terminaux hors ligne`),
    expired: (n: number) => (n === 1 ? "1 pièce périmée" : `${n} pièces périmées`),
    offlineTitle: (m: string) => `${m} est hors ligne`,
    offlineBody: (t: string) =>
      `Depuis ${t}, le terminal de paiement n'est pas connecté : le paiement par carte ne fonctionne pas.`,
    onlineTitle: (m: string) => `${m} est de nouveau en ligne`,
    onlineBody: (from: string, to: string) => `Le terminal de paiement était hors ligne de ${from} à ${to}.`,
    syncTitle: "La connexion Payter ne fonctionne pas",
    syncBody: (t: string, account: string | null) =>
      `Depuis ${t}, aucune nouvelle vente n'arrive${account ? ` de ${account}` : ""}. Voir Réglages → Payter.`,
    syncOkTitle: "La connexion Payter fonctionne à nouveau",
    syncOkBody: "Les nouvelles ventes arrivent à nouveau.",
    failedTitle: (n: number, m: string) => `${n} paiements échoués · ${m}`,
    failedBody: "Au cours de la dernière heure. Vérifiez que le terminal de paiement fonctionne.",
    lowTitle: (m: string) => `${m} est presque vide`,
    lowBody: (p: string, limit: string) => `Encore ${p} rempli, sous votre seuil de ${limit}.`,
    testTitle: "Notification de test",
    testBody: (summary: string) => `Voici comment vos notifications arrivent. ${summary}`,
    why: "Vous recevez ce message parce que vous l'avez activé dans Réglages → Notifications.",
  },
  en: {
    sales: (n: number) => (n === 1 ? "1 sale" : `${n} sales`),
    slot: (s: string | null) => `slot ${s ?? "?"}`,
    today: "Today",
    yesterday: "Yesterday",
    lastWeek: "Last week",
    noSalesYet: "No sales yet",
    noSales: "No sales",
    best: (name: string, money: string) => `best: ${name} (${money})`,
    low: (n: number, p: string) => (n === 1 ? `1 machine below ${p}` : `${n} machines below ${p}`),
    offlineCount: (n: number) => (n === 1 ? "1 terminal offline" : `${n} terminals offline`),
    expired: (n: number) => (n === 1 ? "1 item past its date" : `${n} items past their date`),
    offlineTitle: (m: string) => `${m} is offline`,
    offlineBody: (t: string) => `Since ${t} the payment terminal is not connected: card payments don't work right now.`,
    onlineTitle: (m: string) => `${m} is back online`,
    onlineBody: (from: string, to: string) => `The payment terminal was offline from ${from} to ${to}.`,
    syncTitle: "Payter connection is down",
    syncBody: (t: string, account: string | null) =>
      `No new sales have come in since ${t}${account ? ` from ${account}` : ""}. Check Settings → Payter.`,
    syncOkTitle: "Payter connection works again",
    syncOkBody: "New sales are coming in again.",
    failedTitle: (n: number, m: string) => `${n} payments failed · ${m}`,
    failedBody: "In the last hour. Check that the payment terminal works.",
    lowTitle: (m: string) => `${m} is almost empty`,
    lowBody: (p: string, limit: string) => `${p} full, below your limit of ${limit}.`,
    testTitle: "Test notification",
    testBody: (summary: string) => `This is how your notifications arrive. ${summary}`,
    why: "You get this message because you turned it on in Settings → Notifications.",
  },
};

/** The day, hour, minute and weekday in Brussels. */
function brussels(date: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: parts.weekday as string,
    asUtc: Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second),
  };
}

/** The moment midnight starts a Brussels day ("2026-10-23"), summer time or not. */
function midnight(day: string): Date {
  const guess = new Date(`${day}T00:00:00Z`);
  const offset = brussels(guess).asUtc - guess.getTime();
  return new Date(guess.getTime() - offset);
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** "Koekelare Chens Garden" as "Koekelare": the owner's own name after each machine only takes room (as the overview). */
function withoutOrgName(name: string, orgName: string | null): string {
  if (!orgName?.trim()) return name;
  const suffix = ` ${orgName.trim()}`.toLocaleLowerCase("nl-BE");
  const short = name.toLocaleLowerCase("nl-BE").endsWith(suffix) ? name.slice(0, name.length - suffix.length).trim() : name;
  return short || name;
}

function terminal(machine: ScopeMachine, now: number): "online" | "offline" | "unknown" {
  if (!machine.last_connected_at) return "unknown";
  if (!machine.last_disconnected_at) return "online";
  const connected = Date.parse(machine.last_connected_at);
  const disconnected = Date.parse(machine.last_disconnected_at);
  return disconnected > connected && now - disconnected > GRACE_MS ? "offline" : "online";
}

function inQuiet(p: Prefs, hour: number): boolean {
  if (!p.quiet || p.quiet_from === p.quiet_to) return false;
  return p.quiet_from < p.quiet_to ? hour >= p.quiet_from && hour < p.quiet_to : hour >= p.quiet_from || hour < p.quiet_to;
}

Deno.serve(async (req) => {
  const db = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: keys } = await db.from("app_keys").select("name, value");
  const key = (name: string) => keys?.find((k) => k.name === name)?.value ?? "";

  // Called by pg_cron and by the app's own server with the shared secret; nothing else gets in.
  const given = req.headers.get("x-notify-secret") ?? "";
  if (!key("notify_secret") || given !== key("notify_secret")) return new Response("forbidden", { status: 403 });

  const input = (req.method === "POST" ? await req.json().catch(() => ({})) : {}) as {
    test?: { user_id?: string; org_id?: string };
  };
  const pushReady = Boolean(key("vapid_private") && key("vapid_public"));
  if (pushReady) webpush.setVapidDetails(key("vapid_subject"), key("vapid_public"), key("vapid_private"));
  const emailReady = Boolean(key("resend_api_key") && key("mail_from"));
  const smsReady = Boolean(key("twilio_sid") && key("twilio_token") && key("twilio_from"));
  const appUrl = (key("app_url") || "https://vendly-six-gold.vercel.app").replace(/\/$/, "");

  const now = new Date();
  const nowMs = now.getTime();
  const local = brussels(now);

  // Read once per run: who the person is with, and their devices.
  async function context(prefs: Prefs[]) {
    const orgIds = [...new Set(prefs.map((p) => p.org_id))];
    const [{ data: orgs }, { data: subs }] = await Promise.all([
      db.from("organizations").select("id, name, brand_name").in("id", orgIds),
      db
        .from("push_subscriptions")
        .select("endpoint, p256dh, auth, failures, user_id, org_id")
        .in("org_id", orgIds)
        .not("user_id", "is", null),
    ]);
    return { orgs: orgs ?? [], subs: subs ?? [] };
  }
  type Context = Awaited<ReturnType<typeof context>>;

  /** Sends one message on the chosen channels; says per channel how it went. */
  async function deliver(ctx: Context, p: Prefs, channels: Channel[], msg: Message, quiet: boolean, brand: string) {
    const outcome: Outcome = {};
    for (const channel of new Set(channels)) {
      if (channel === "push") {
        if (quiet) outcome.push = "quiet";
        else if (!pushReady) outcome.push = "no_provider";
        else {
          const devices = ctx.subs.filter((s) => s.user_id === p.user_id && s.org_id === p.org_id);
          if (!devices.length) outcome.push = "no_device";
          else {
            let sent = 0;
            for (const sub of devices) {
              try {
                await webpush.sendNotification(
                  { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                  JSON.stringify({ title: msg.title, body: msg.body, url: msg.url, tag: msg.tag }),
                );
                sent += 1;
                await db.from("push_subscriptions").update({ last_sent_at: now.toISOString(), failures: 0 }).eq("endpoint", sub.endpoint);
              } catch (error) {
                // A browser that unsubscribed answers 404 or 410; that row is dead.
                const status = (error as { statusCode?: number }).statusCode;
                if (status === 404 || status === 410) await db.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
                else await db.from("push_subscriptions").update({ failures: (sub.failures ?? 0) + 1 }).eq("endpoint", sub.endpoint);
              }
            }
            outcome.push = sent > 0 ? "sent" : "failed";
          }
        }
      } else if (channel === "email") {
        // Mail waits in the inbox: quiet hours do not hold it back.
        if (!p.email) outcome.email = "no_address";
        else if (!emailReady) outcome.email = "no_provider";
        else {
          const t = TEXT[p.locale] ?? TEXT.nl;
          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${key("resend_api_key")}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: key("mail_from"),
              to: [p.email],
              subject: msg.title,
              text: [msg.body, "", `${appUrl}${msg.url}`, "", t.why].join("\n"),
            }),
          }).catch(() => null);
          outcome.email = response?.ok ? "sent" : "failed";
        }
      } else if (channel === "sms") {
        if (quiet) outcome.sms = "quiet";
        else if (!p.phone) outcome.sms = "no_number";
        else if (!smsReady) outcome.sms = "no_provider";
        else {
          const sid = key("twilio_sid");
          const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
            method: "POST",
            headers: {
              Authorization: `Basic ${btoa(`${sid}:${key("twilio_token")}`)}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ To: p.phone, From: key("twilio_from"), Body: `${brand}: ${msg.title}. ${msg.body}`.slice(0, 320) }),
          }).catch(() => null);
          outcome.sms = response?.ok ? "sent" : "failed";
        }
      }
    }
    return { outcome, delivered: Object.values(outcome).includes("sent") };
  }

  async function log(p: Prefs, msg: Message, outcome: Outcome, open: boolean) {
    await db.from("notification_log").insert({
      user_id: p.user_id,
      org_id: p.org_id,
      kind: msg.kind,
      key: msg.key ?? null,
      title: msg.title,
      body: msg.body,
      url: msg.url,
      sent: outcome,
      resolved_at: open ? null : now.toISOString(),
    });
  }

  /** Everything about one person, in the order a phone would want it. */
  function person(ctx: Context, p: Prefs) {
    const org = ctx.orgs.find((o) => o.id === p.org_id);
    const brand = (org?.brand_name as string | null) || (p.business_id ? "MATO Info" : "Vendly");
    const t = TEXT[p.locale] ?? TEXT.nl;
    const intl = INTL[p.locale] ?? INTL.nl;
    const short = (name: string) => withoutOrgName(name, (org?.name as string | null) ?? null);
    const money = (value: number) => new Intl.NumberFormat(intl, { style: "currency", currency: "EUR" }).format(value);
    const pct = (n: number) => (p.locale === "fr" ? `${n} %` : `${n}%`);
    const clock = (iso: string) =>
      new Intl.DateTimeFormat(intl, { timeZone: ZONE, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
    const dayName = (date: Date) =>
      new Intl.DateTimeFormat(intl, { timeZone: ZONE, weekday: "short", day: "numeric", month: "short" }).format(date);
    // Today only the hour; an older moment with its day.
    const when = (iso: string) => (brussels(new Date(iso)).day === local.day ? clock(iso) : `${dayName(new Date(iso))} ${clock(iso)}`);

    let scope: ScopeMachine[] | null = null;
    const machines = async () => {
      if (!scope) {
        const { data } = await db.rpc("alert_scope", { p_org: p.org_id, p_business: p.business_id });
        scope = (data ?? []) as ScopeMachine[];
      }
      return scope;
    };
    const fills = async () => {
      const { data } = await db.rpc("alert_machine_fill", { p_org: p.org_id, p_business: p.business_id });
      return (data ?? []) as { machine_id: string; machine_name: string; percent: number }[];
    };

    /** The day so far (an evening hour) or yesterday (a morning hour), or last week, with what needs doing. */
    async function overview(span: "day" | "week" | "test"): Promise<Message> {
      let from: Date;
      let to: Date;
      let title: string;
      let soFar = false;
      if (span === "week") {
        from = midnight(addDays(local.day, -7));
        to = midnight(local.day);
        title = `${t.lastWeek} · ${dayName(from)} – ${dayName(new Date(to.getTime() - HOUR))}`;
      } else if (span === "day" && p.daily_hour < 12) {
        from = midnight(addDays(local.day, -1));
        to = midnight(local.day);
        title = `${t.yesterday} · ${dayName(from)}`;
      } else {
        from = midnight(local.day);
        to = now;
        soFar = true;
        title = `${t.today} · ${dayName(now)}`;
      }
      const { data } = await db.rpc("alert_period_summary", {
        p_org: p.org_id,
        p_business: p.business_id,
        p_from: from.toISOString(),
        p_to: to.toISOString(),
      });
      const sum = ((Array.isArray(data) ? data[0] : data) ?? { revenue: 0, units: 0 }) as {
        revenue: number;
        units: number;
        best_machine: string | null;
        best_revenue: number | null;
      };
      const parts: string[] = [];
      if (sum.units > 0) {
        parts.push(`${money(Number(sum.revenue))} · ${t.sales(sum.units)}`);
        if (sum.best_machine && (await machines()).length > 1) parts.push(t.best(short(sum.best_machine), money(Number(sum.best_revenue))));
      } else parts.push(soFar ? t.noSalesYet : t.noSales);
      if (span !== "week") {
        const low = (await fills()).filter((f) => f.percent < p.low_percent).length;
        if (low > 0) parts.push(t.low(low, pct(p.low_percent)));
        const offline = (await machines()).filter((m) => terminal(m, nowMs) === "offline").length;
        if (offline > 0) parts.push(t.offlineCount(offline));
        const { data: digest } = await db.rpc("evening_digest", { target_org: p.org_id, target_business: p.business_id });
        const expired = Number(((Array.isArray(digest) ? digest[0] : digest) as { expired?: number } | null)?.expired ?? 0);
        if (expired > 0) parts.push(t.expired(expired));
      }
      if (span === "test") {
        return { kind: "test", title: t.testTitle, body: t.testBody(`${t.today}: ${parts.join(" · ")}`), url: "/settings", tag: "test" };
      }
      return {
        kind: span === "week" ? "weekly" : "daily",
        title,
        body: parts.join(" · "),
        url: span === "week" ? "/statistics" : "/",
        tag: span === "week" ? "weekly" : "daily",
      };
    }

    async function run() {
      const quiet = inQuiet(p, local.hour);
      const results: Record<string, unknown>[] = [];
      const send = async (channels: Channel[], msg: Message, options: { quiet: boolean; open?: boolean; always?: boolean }) => {
        const { outcome, delivered } = await deliver(ctx, p, channels, msg, options.quiet, brand);
        if (delivered || options.always) await log(p, msg, outcome, Boolean(options.open));
        results.push({ kind: msg.kind, title: msg.title, outcome });
        return delivered;
      };
      const update = (fields: Record<string, unknown>) =>
        db.from("notification_prefs").update(fields).eq("user_id", p.user_id).eq("org_id", p.org_id);
      const { data: openRows } = await db
        .from("notification_log")
        .select("id, kind, key, created_at")
        .eq("user_id", p.user_id)
        .eq("org_id", p.org_id)
        .is("resolved_at", null);
      const open = (openRows ?? []) as Episode[];
      const episode = (kind: string, key: string) => open.find((e) => e.kind === kind && e.key === key);
      const resolve = (e: Episode) => db.from("notification_log").update({ resolved_at: now.toISOString() }).eq("id", e.id);

      // 1. The day's overview at the hour they chose (quiet hours do not apply: they picked it), once a day.
      if (p.daily.length && local.hour === p.daily_hour && p.daily_sent_on !== local.day) {
        await update({ daily_sent_on: local.day });
        await send(p.daily, await overview("day"), { quiet: false, always: true });
      }

      // 2. Last week, on Monday at the same hour.
      if (p.weekly.length && local.weekday === "Mon" && local.hour === p.daily_hour && p.weekly_sent_on !== local.day) {
        await update({ weekly_sent_on: local.day });
        await send(p.weekly, await overview("week"), { quiet: false, always: true });
      }

      // 3. Every sale, as it arrives: one message per run, however many came in.
      if (p.sales.length) {
        if (!p.sales_seen_at) await update({ sales_seen_at: now.toISOString() });
        else {
          const { data } = await db.rpc("alert_new_sales", { p_org: p.org_id, p_business: p.business_id, p_after: p.sales_seen_at });
          const rows = (data ?? []) as {
            id: string;
            created_at: string;
            occurred_at: string;
            amount: number;
            machine_name: string;
            selection: string | null;
            product_name: string | null;
          }[];
          if (rows.length) {
            await update({ sales_seen_at: rows[rows.length - 1].created_at });
            let msg: Message;
            if (rows.length === 1) {
              const sale = rows[0];
              msg = {
                kind: "sale",
                title: `${money(Number(sale.amount))} · ${short(sale.machine_name)}`,
                body: `${sale.product_name ?? t.slot(sale.selection)} · ${when(sale.occurred_at)}`,
                url: "/",
                tag: `sale-${sale.id}`,
              };
            } else {
              const perMachine = new Map<string, number>();
              for (const sale of rows) perMachine.set(short(sale.machine_name), (perMachine.get(short(sale.machine_name)) ?? 0) + 1);
              const most = [...perMachine].sort((a, b) => b[1] - a[1]);
              msg = {
                kind: "sale",
                title: `${t.sales(rows.length)} · ${money(rows.reduce((total, sale) => total + Number(sale.amount), 0))}`,
                body: most.slice(0, 3).map(([name, n]) => `${name} ${n}×`).join(" · ") + (most.length > 3 ? " …" : ""),
                url: "/",
                tag: `sale-${rows[0].id}`,
              };
            }
            await send(p.sales, msg, { quiet });
          }
        }
      }

      // 4. Errors: a terminal offline, Payter failing, payments failing in a row.
      if (p.errors.length) {
        for (const machine of await machines()) {
          const status = terminal(machine, nowMs);
          const known = episode("offline", machine.machine_id);
          if (status === "offline" && !known && nowMs - Date.parse(machine.last_disconnected_at!) < FRESH_MS) {
            await send(
              p.errors,
              {
                kind: "offline",
                key: machine.machine_id,
                title: t.offlineTitle(short(machine.machine_name)),
                body: t.offlineBody(when(machine.last_disconnected_at!)),
                url: p.business_id ? "/" : `/machines/${machine.machine_id}`,
                tag: `terminal-${machine.machine_id}`,
              },
              { quiet, open: true },
            );
          } else if (status === "online" && known) {
            await resolve(known);
            await send(
              p.errors,
              {
                kind: "online",
                key: machine.machine_id,
                title: t.onlineTitle(short(machine.machine_name)),
                body: t.onlineBody(when(machine.last_disconnected_at ?? known.created_at), when(machine.last_connected_at!)),
                url: p.business_id ? "/" : `/machines/${machine.machine_id}`,
                tag: `terminal-${machine.machine_id}`,
              },
              { quiet },
            );
          }
        }

        // Payter is the operator's: a shop has no say over it.
        if (!p.business_id) {
          const [{ data: own }, { data: extras }] = await Promise.all([
            db.from("payter_credentials").select("last_synced_at").eq("org_id", p.org_id).maybeSingle(),
            db.from("payter_extra_logins").select("id, domain, last_synced_at").eq("org_id", p.org_id),
          ]);
          const accounts: { key: string; label: string | null; syncedAt: string | null; domain: string | null }[] = [
            ...(own ? [{ key: "own", label: null, syncedAt: own.last_synced_at as string | null, domain: null }] : []),
            ...(extras ?? []).map((x) => ({
              key: x.id as string,
              label: x.domain as string,
              syncedAt: x.last_synced_at as string | null,
              domain: x.domain as string,
            })),
          ];
          for (const account of accounts) {
            // The last failure of this login: a further login's carry its account code in front.
            let query = db
              .from("sync_logs")
              .select("started_at")
              .eq("org_id", p.org_id)
              .eq("status", "error")
              .order("started_at", { ascending: false })
              .limit(1);
            if (account.domain) query = query.like("error", `${account.domain}: %`);
            else for (const x of extras ?? []) query = query.not("error", "like", `${x.domain}: %`);
            const { data: failure } = await query.maybeSingle();
            const failing =
              Boolean(failure) &&
              (!account.syncedAt || (failure!.started_at as string) > account.syncedAt) &&
              (!account.syncedAt || nowMs - Date.parse(account.syncedAt) > SYNC_DOWN_MS);
            const known = episode("sync", account.key);
            if (failing && !known) {
              await send(
                p.errors,
                {
                  kind: "sync",
                  key: account.key,
                  title: t.syncTitle,
                  body: t.syncBody(when(account.syncedAt ?? (failure!.started_at as string)), account.label),
                  url: "/settings",
                  tag: `payter-${account.key}`,
                },
                { quiet, open: true },
              );
            } else if (!failing && known && account.syncedAt && account.syncedAt > known.created_at) {
              await resolve(known);
              await send(p.errors, { kind: "sync_ok", key: account.key, title: t.syncOkTitle, body: t.syncOkBody, url: "/", tag: `payter-${account.key}` }, { quiet });
            }
          }
        }

        const { data: failed } = await db.rpc("alert_failed_payments", { p_org: p.org_id, p_business: p.business_id, p_min: 3 });
        for (const row of (failed ?? []) as { machine_id: string; machine_name: string; failed: number }[]) {
          const { data: told } = await db
            .from("notification_log")
            .select("id")
            .eq("user_id", p.user_id)
            .eq("org_id", p.org_id)
            .eq("kind", "failed")
            .eq("key", row.machine_id)
            .gt("created_at", new Date(nowMs - 3 * HOUR).toISOString())
            .limit(1);
          if (told?.length) continue;
          await send(
            p.errors,
            {
              kind: "failed",
              key: row.machine_id,
              title: t.failedTitle(row.failed, short(row.machine_name)),
              body: t.failedBody,
              url: p.business_id ? "/" : `/machines/${row.machine_id}`,
              tag: `failed-${row.machine_id}`,
            },
            { quiet },
          );
        }
      }

      // 5. A machine almost empty: every five minutes is soon enough.
      if (p.low_stock.length && local.minute % 5 === 0) {
        for (const fill of await fills()) {
          const known = episode("low", fill.machine_id);
          if (fill.percent < p.low_percent && !known) {
            await send(
              p.low_stock,
              {
                kind: "low",
                key: fill.machine_id,
                title: t.lowTitle(short(fill.machine_name)),
                body: t.lowBody(pct(fill.percent), pct(p.low_percent)),
                url: p.business_id ? "/" : `/refill/machines/${fill.machine_id}`,
                tag: `low-${fill.machine_id}`,
              },
              { quiet, open: true },
            );
          } else if (known && fill.percent >= p.low_percent + LOW_MARGIN) {
            await resolve(known);
          }
        }
      }
      return results;
    }

    async function test() {
      const chosen = [...new Set([...p.daily, ...p.weekly, ...p.sales, ...p.errors, ...p.low_stock])] as Channel[];
      const msg = await overview("test");
      const { outcome } = await deliver(ctx, p, chosen.length ? chosen : ["push"], msg, false, brand);
      await log(p, msg, outcome, false);
      return outcome;
    }

    return { run, test };
  }

  if (input.test) {
    const { data } = await db
      .from("notification_prefs")
      .select("*")
      .eq("user_id", input.test.user_id ?? "")
      .eq("org_id", input.test.org_id ?? "")
      .maybeSingle();
    if (!data) return Response.json({ error: "no preferences" }, { status: 404 });
    const p = data as Prefs;
    const sent = await person(await context([p]), p).test();
    return Response.json({ sent });
  }

  // One run at a time: a slow run must not send the same message twice.
  const { data: took } = await db.rpc("alert_lease_take", { p_seconds: 55 });
  if (!took) return Response.json({ busy: true });
  const results: Record<string, unknown>[] = [];
  try {
    const { data: rows } = await db.from("notification_prefs").select("*");
    const prefs = (rows ?? []) as Prefs[];
    if (prefs.length) {
      const ctx = await context(prefs);
      for (const p of prefs) {
        try {
          const sent = await person(ctx, p).run();
          if (sent.length) results.push({ user: p.user_id, org: p.org_id, sent });
        } catch (error) {
          results.push({ user: p.user_id, org: p.org_id, error: String(error) });
        }
      }
    }
    // The log keeps 90 days, trimmed once a night.
    if (local.hour === 3 && local.minute === 0) {
      await db.from("notification_log").delete().lt("created_at", new Date(nowMs - 90 * 24 * HOUR).toISOString());
    }
  } finally {
    await db.rpc("alert_lease_release");
  }
  return Response.json({ at: now.toISOString(), results });
});
