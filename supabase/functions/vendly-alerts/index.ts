// Instellingen → Meldingen (23-10-2026, Xin: "put notifications on and send them on email or sms and also filter what
// they notifications about such as one time per day a overview or every sale or if error"; the same day "remove push
// but focus more on email", then "i dont wnat to activate sms"). Runs every minute (pg_cron) and tells each person by
// email what they asked for (Resend: resend_api_key and mail_from in app_keys). Without those keys nothing goes out and
// the log says why: nothing pretends to be sent. An email is a full page (the day's money per machine, what sold most,
// what needs doing). The columns phone and quiet* of notification_prefs stay, unread.
//
// One problem is one message: a terminal offline, Payter failing and a machine almost empty each open an episode in
// notification_log and close it when it is over (offline and Payter then say so). A message that reached nobody opens
// nothing, so it is told again on the next run if the problem is still there.
//
// POST {"test": {"user_id", "org_id"}} sends the day's overview at once, as a test, for "Stuur een test" in Instellingen.
// POST {"preview": {"user_id", "org_id"}} only returns that email ({subject, html}), for "Bekijk de e-mail".
import { createClient } from "jsr:@supabase/supabase-js@2";

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
/** The sales an email lists one by one; more are counted. */
const SALES_LISTED = 25;
/** MATO gold, as `--primary` in the app. */
const GOLD = "#b5862a";

type Channel = "email";
type Locale = "nl" | "fr" | "en";
type Prefs = {
  user_id: string;
  org_id: string;
  business_id: string | null;
  locale: Locale;
  email: string | null;
  daily: string[];
  weekly: string[];
  sales: string[];
  errors: string[];
  low_stock: string[];
  daily_hour: number;
  low_percent: number;
  sales_seen_at: string | null;
  daily_sent_on: string | null;
  weekly_sent_on: string | null;
};
type Line = { name: string; units: number; revenue: number };
/** What an email shows beyond its title and line: an overview, or the sales one by one. */
type Detail =
  | { type: "overview"; revenue: number; units: number; soFar: boolean; machines: Line[]; products: Line[]; todo: string[] | null }
  | { type: "sales"; rows: { when: string; machine: string; product: string; amount: number }[]; more: number };
type Message = { kind: string; key?: string | null; title: string; body: string; url: string; detail?: Detail };
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
    test: "Test",
    why: "Je krijgt deze e-mail omdat je hem aanzette bij Instellingen → Meldingen.",
    adjust: "Meldingen aanpassen",
    open: (brand: string) => `Open ${brand}`,
    perMachine: "Per automaat",
    topProducts: "Meest verkocht",
    todo: "Wat er te doen is",
    allGood: "Niets dringends.",
    soFar: "tot nu",
    pieces: (n: number) => `${n} st.`,
    lowItem: (m: string, p: string) => `${m} is nog ${p} gevuld`,
    offlineItem: (m: string) => `${m}: betaalterminal offline`,
    more: (n: number) => `en nog ${n}`,
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
    test: "Test",
    why: "Vous recevez cet e-mail parce que vous l'avez activé dans Réglages → Notifications.",
    adjust: "Modifier les notifications",
    open: (brand: string) => `Ouvrir ${brand}`,
    perMachine: "Par distributeur",
    topProducts: "Les plus vendus",
    todo: "À faire",
    allGood: "Rien d'urgent.",
    soFar: "jusqu'à présent",
    pieces: (n: number) => `${n} pc`,
    lowItem: (m: string, p: string) => `${m} n'est plus rempli qu'à ${p}`,
    offlineItem: (m: string) => `${m} : terminal de paiement hors ligne`,
    more: (n: number) => `et ${n} de plus`,
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
    test: "Test",
    why: "You get this email because you turned it on in Settings → Notifications.",
    adjust: "Change notifications",
    open: (brand: string) => `Open ${brand}`,
    perMachine: "Per machine",
    topProducts: "Best sellers",
    todo: "To do",
    allGood: "Nothing urgent.",
    soFar: "so far",
    pieces: (n: number) => `${n} pcs`,
    lowItem: (m: string, p: string) => `${m} is ${p} full`,
    offlineItem: (m: string) => `${m}: payment terminal offline`,
    more: (n: number) => `and ${n} more`,
  },
};
type Text = (typeof TEXT)["nl"];

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

/** Only the channels there are now: a push or sms chosen before goes nowhere. */
function channels(list: string[] | null): Channel[] {
  return (["email"] as const).filter((channel) => (list ?? []).includes(channel));
}

const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/**
 * The email itself: a plain card that reads well in Gmail, Outlook and on a phone (tables and inline styles only, no
 * pictures to load). The brand as the app shows it ("[mato]"), the title, then the overview or the sales, or the
 * message, and one button into the app.
 */
function renderEmail(
  msg: Message,
  o: { brand: string; t: Text; locale: Locale; money: (n: number) => string; appUrl: string; subject: string },
): string {
  const { t } = o;
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const muted = "#71717a";
  const line = "#ececef";
  const section = (title: string, inner: string) =>
    `<tr><td style="padding:22px 28px 0"><p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${muted}">${escape(title)}</p>${inner}</td></tr>`;
  const rows = (items: string[][], alignLast = true) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:15px">${items
      .map(
        (cells) =>
          `<tr>${cells
            .map(
              (cell, i) =>
                `<td style="padding:9px 0;border-top:1px solid ${line};${i === 0 ? "" : "padding-left:12px;white-space:nowrap;"}${
                  alignLast && i === cells.length - 1 && i > 0 ? "text-align:right;font-weight:600;" : i > 0 ? `color:${muted};` : ""
                }">${cell}</td>`,
            )
            .join("")}</tr>`,
      )
      .join("")}</table>`;

  let content = "";
  const detail = msg.detail;
  if (detail?.type === "overview") {
    content += `<tr><td style="padding:14px 28px 0"><p style="margin:0;font-size:36px;font-weight:700;letter-spacing:-0.02em">${escape(
      o.money(detail.revenue),
    )}</p><p style="margin:4px 0 0;font-size:15px;color:${muted}">${escape(detail.units > 0 ? t.sales(detail.units) : detail.soFar ? t.noSalesYet : t.noSales)}${
      detail.soFar && detail.units > 0 ? ` · ${escape(t.soFar)}` : ""
    }</p></td></tr>`;
    if (detail.machines.length) {
      content += section(
        t.perMachine,
        rows(detail.machines.map((m) => [escape(m.name), escape(t.pieces(m.units)), escape(o.money(m.revenue))])),
      );
    }
    if (detail.products.length) {
      content += section(
        t.topProducts,
        rows(detail.products.map((p) => [escape(p.name), escape(t.pieces(p.units)), escape(o.money(p.revenue))])),
      );
    }
    if (detail.todo) {
      content += section(
        t.todo,
        detail.todo.length
          ? `<ul style="margin:0;padding-left:18px;font-size:15px;line-height:1.6">${detail.todo.map((item) => `<li>${escape(item)}</li>`).join("")}</ul>`
          : `<p style="margin:0;font-size:15px;color:#15803d">${escape(t.allGood)}</p>`,
      );
    }
  } else if (detail?.type === "sales") {
    content += `<tr><td style="padding:14px 28px 0">${rows(
      detail.rows.map((r) => [
        `<span style="color:${muted}">${escape(r.when)}</span>&nbsp; ${escape(r.machine)}<br><span style="color:${muted};font-size:14px">${escape(r.product)}</span>`,
        escape(o.money(r.amount)),
      ]),
    )}${detail.more > 0 ? `<p style="margin:8px 0 0;font-size:14px;color:${muted}">${escape(t.more(detail.more))}</p>` : ""}</td></tr>`;
  } else {
    content += `<tr><td style="padding:12px 28px 0"><p style="margin:0;font-size:16px;line-height:1.55">${escape(msg.body)}</p></td></tr>`;
  }

  const link = `${o.appUrl}${msg.url}`;
  return `<!doctype html><html lang="${o.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${escape(
    o.subject,
  )}</title></head><body style="margin:0;padding:0;background:#f4f4f5">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escape(msg.body)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;font-family:${font};color:#18181b">
<tr><td style="padding:24px 28px 0;font-size:20px;font-weight:700;letter-spacing:-0.01em"><span style="color:${GOLD}">[</span>&nbsp;${escape(
    o.brand.toLocaleLowerCase(INTL[o.locale]),
  )}&nbsp;<span style="color:${GOLD}">]</span></td></tr>
<tr><td style="padding:18px 28px 0"><h1 style="margin:0;font-size:22px;line-height:1.3;letter-spacing:-0.01em">${escape(msg.title)}</h1></td></tr>
${content}
<tr><td style="padding:26px 28px 28px"><a href="${escape(link)}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:999px">${escape(
    t.open(o.brand),
  )}</a></td></tr>
</table>
<p style="max-width:560px;margin:16px auto 0;font-family:${font};font-size:12px;line-height:1.5;color:${muted}">${escape(t.why)} <a href="${escape(
    `${o.appUrl}/settings`,
  )}" style="color:${muted}">${escape(t.adjust)}</a></p>
</td></tr></table></body></html>`;
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
    preview?: { user_id?: string; org_id?: string };
  };
  const emailReady = Boolean(key("resend_api_key") && key("mail_from"));
  const appUrl = (key("app_url") || "https://vendly-six-gold.vercel.app").replace(/\/$/, "");

  const now = new Date();
  const nowMs = now.getTime();
  const local = brussels(now);

  // Read once per run: whom the person is with.
  async function context(prefs: Prefs[]) {
    const orgIds = [...new Set(prefs.map((p) => p.org_id))];
    const { data: orgs } = await db.from("organizations").select("id, name, brand_name").in("id", orgIds);
    return { orgs: orgs ?? [] };
  }
  type Context = Awaited<ReturnType<typeof context>>;

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
    const locale: Locale = p.locale in TEXT ? p.locale : "nl";
    const t = TEXT[locale];
    const intl = INTL[locale];
    const short = (name: string) => withoutOrgName(name, (org?.name as string | null) ?? null);
    const money = (value: number) => new Intl.NumberFormat(intl, { style: "currency", currency: "EUR" }).format(value);
    const pct = (n: number) => (locale === "fr" ? `${n} %` : `${n}%`);
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

    /** Sends one message on the chosen channels; says per channel how it went. */
    async function deliver(chosen: Channel[], msg: Message, subject = msg.title) {
      const outcome: Outcome = {};
      for (const channel of new Set(chosen)) {
        if (channel === "email") {
          if (!p.email) outcome.email = "no_address";
          else if (!emailReady) outcome.email = "no_provider";
          else {
            const from = key("mail_from").includes("<") ? key("mail_from") : `"${brand.replace(/"/g, "")}" <${key("mail_from")}>`;
            const response = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: `Bearer ${key("resend_api_key")}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                from,
                to: [p.email],
                subject,
                html: renderEmail(msg, { brand, t, locale, money, appUrl, subject }),
                text: [msg.body, "", `${appUrl}${msg.url}`, "", t.why].join("\n"),
                headers: { "List-Unsubscribe": `<${appUrl}/settings>` },
              }),
            }).catch(() => null);
            outcome.email = response?.ok ? "sent" : "failed";
          }
        }
      }
      return { outcome, delivered: Object.values(outcome).includes("sent") };
    }

    /** The day so far (an evening hour) or yesterday (a morning hour), or last week, with what needs doing. */
    async function overview(span: "day" | "week"): Promise<Message> {
      let from: Date;
      let to: Date;
      let title: string;
      let soFar = false;
      if (span === "week") {
        from = midnight(addDays(local.day, -7));
        to = midnight(local.day);
        title = `${t.lastWeek} · ${dayName(from)} – ${dayName(new Date(to.getTime() - HOUR))}`;
      } else if (p.daily_hour < 12) {
        from = midnight(addDays(local.day, -1));
        to = midnight(local.day);
        title = `${t.yesterday} · ${dayName(from)}`;
      } else {
        from = midnight(local.day);
        to = now;
        soFar = true;
        title = `${t.today} · ${dayName(now)}`;
      }
      const { data } = await db.rpc("alert_period_detail", {
        p_org: p.org_id,
        p_business: p.business_id,
        p_from: from.toISOString(),
        p_to: to.toISOString(),
      });
      const found = (data ?? { machines: [], products: [] }) as { machines: Line[]; products: Line[] };
      const perMachine = found.machines.map((m) => ({ name: short(m.name), units: Number(m.units), revenue: Number(m.revenue) }));
      const products = found.products.map((m) => ({ name: m.name, units: Number(m.units), revenue: Number(m.revenue) }));
      const revenue = perMachine.reduce((sum, m) => sum + m.revenue, 0);
      const units = perMachine.reduce((sum, m) => sum + m.units, 0);

      // The hidden first line of the email, and its plain-text part.
      const parts: string[] = [];
      if (units > 0) {
        parts.push(`${money(revenue)} · ${t.sales(units)}`);
        if (perMachine.length > 1 && perMachine[0].revenue > 0) parts.push(t.best(perMachine[0].name, money(perMachine[0].revenue)));
      } else parts.push(soFar ? t.noSalesYet : t.noSales);

      // What needs doing, only on the day's overview: it is the state now, not of last week.
      let todo: string[] | null = null;
      if (span === "day") {
        const low = (await fills()).filter((f) => f.percent < p.low_percent).sort((a, b) => a.percent - b.percent);
        const offline = (await machines()).filter((m) => terminal(m, nowMs) === "offline");
        const { data: digest } = await db.rpc("evening_digest", { target_org: p.org_id, target_business: p.business_id });
        const expired = Number(((Array.isArray(digest) ? digest[0] : digest) as { expired?: number } | null)?.expired ?? 0);
        todo = [
          ...low.map((f) => t.lowItem(short(f.machine_name), pct(f.percent))),
          ...offline.map((m) => t.offlineItem(short(m.machine_name))),
          ...(expired > 0 ? [t.expired(expired)] : []),
        ];
        if (low.length) parts.push(t.low(low.length, pct(p.low_percent)));
        if (offline.length) parts.push(t.offlineCount(offline.length));
        if (expired > 0) parts.push(t.expired(expired));
      }
      return {
        kind: span === "week" ? "weekly" : "daily",
        title,
        body: parts.join(" · "),
        url: span === "week" ? "/statistics" : "/",
        detail: { type: "overview", revenue, units, soFar, machines: perMachine, products, todo },
      };
    }

    async function run() {
      const results: Record<string, unknown>[] = [];
      const send = async (chosen: Channel[], msg: Message, options: { open?: boolean; always?: boolean } = {}) => {
        const { outcome, delivered } = await deliver(chosen, msg);
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
      const topic = {
        daily: channels(p.daily),
        weekly: channels(p.weekly),
        sales: channels(p.sales),
        errors: channels(p.errors),
        low: channels(p.low_stock),
      };

      // 1. The day's overview at the hour they chose, once a day.
      if (topic.daily.length && local.hour === p.daily_hour && p.daily_sent_on !== local.day) {
        await update({ daily_sent_on: local.day });
        await send(topic.daily, await overview("day"), { always: true });
      }

      // 2. Last week, on Monday at the same hour.
      if (topic.weekly.length && local.weekday === "Mon" && local.hour === p.daily_hour && p.weekly_sent_on !== local.day) {
        await update({ weekly_sent_on: local.day });
        await send(topic.weekly, await overview("week"), { always: true });
      }

      // 3. Every sale, as it arrives: one message per run, however many came in.
      if (topic.sales.length) {
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
            const newest = [...rows].sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
            const total = rows.reduce((sum, sale) => sum + Number(sale.amount), 0);
            let title: string;
            let body: string;
            if (rows.length === 1) {
              const sale = rows[0];
              title = `${money(Number(sale.amount))} · ${short(sale.machine_name)}`;
              body = `${sale.product_name ?? t.slot(sale.selection)} · ${when(sale.occurred_at)}`;
            } else {
              const perMachine = new Map<string, number>();
              for (const sale of rows) perMachine.set(short(sale.machine_name), (perMachine.get(short(sale.machine_name)) ?? 0) + 1);
              const most = [...perMachine].sort((a, b) => b[1] - a[1]);
              title = `${t.sales(rows.length)} · ${money(total)}`;
              body = most.slice(0, 3).map(([name, n]) => `${name} ${n}×`).join(" · ") + (most.length > 3 ? " …" : "");
            }
            await send(
              topic.sales,
              {
                kind: "sale",
                title,
                body,
                url: "/",
                detail: {
                  type: "sales",
                  rows: newest.slice(0, SALES_LISTED).map((sale) => ({
                    when: when(sale.occurred_at),
                    machine: short(sale.machine_name),
                    product: sale.product_name ?? t.slot(sale.selection),
                    amount: Number(sale.amount),
                  })),
                  more: Math.max(0, rows.length - SALES_LISTED),
                },
              },
            );
          }
        }
      }

      // 4. Errors: a terminal offline, Payter failing, payments failing in a row.
      if (topic.errors.length) {
        for (const machine of await machines()) {
          const status = terminal(machine, nowMs);
          const known = episode("offline", machine.machine_id);
          if (status === "offline" && !known && nowMs - Date.parse(machine.last_disconnected_at!) < FRESH_MS) {
            await send(
              topic.errors,
              {
                kind: "offline",
                key: machine.machine_id,
                title: t.offlineTitle(short(machine.machine_name)),
                body: t.offlineBody(when(machine.last_disconnected_at!)),
                url: p.business_id ? "/" : `/machines/${machine.machine_id}`,
              },
              { open: true },
            );
          } else if (status === "online" && known) {
            await resolve(known);
            await send(
              topic.errors,
              {
                kind: "online",
                key: machine.machine_id,
                title: t.onlineTitle(short(machine.machine_name)),
                body: t.onlineBody(when(machine.last_disconnected_at ?? known.created_at), when(machine.last_connected_at!)),
                url: p.business_id ? "/" : `/machines/${machine.machine_id}`,
              },
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
                topic.errors,
                {
                  kind: "sync",
                  key: account.key,
                  title: t.syncTitle,
                  body: t.syncBody(when(account.syncedAt ?? (failure!.started_at as string)), account.label),
                  url: "/settings",
                },
                { open: true },
              );
            } else if (!failing && known && account.syncedAt && account.syncedAt > known.created_at) {
              await resolve(known);
              await send(topic.errors, { kind: "sync_ok", key: account.key, title: t.syncOkTitle, body: t.syncOkBody, url: "/" });
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
            topic.errors,
            {
              kind: "failed",
              key: row.machine_id,
              title: t.failedTitle(row.failed, short(row.machine_name)),
              body: t.failedBody,
              url: p.business_id ? "/" : `/machines/${row.machine_id}`,
            },
          );
        }
      }

      // 5. A machine almost empty: every five minutes is soon enough.
      if (topic.low.length && local.minute % 5 === 0) {
        for (const fill of await fills()) {
          const known = episode("low", fill.machine_id);
          if (fill.percent < p.low_percent && !known) {
            await send(
              topic.low,
              {
                kind: "low",
                key: fill.machine_id,
                title: t.lowTitle(short(fill.machine_name)),
                body: t.lowBody(pct(fill.percent), pct(p.low_percent)),
                url: p.business_id ? "/" : `/refill/machines/${fill.machine_id}`,
              },
              { open: true },
            );
          } else if (known && fill.percent >= p.low_percent + LOW_MARGIN) {
            await resolve(known);
          }
        }
      }
      return results;
    }

    /** "Stuur een test": the day's overview, now, on every channel chosen (email when none is). */
    async function test() {
      const chosen = [...new Set([p.daily, p.weekly, p.sales, p.errors, p.low_stock].flatMap(channels))];
      const msg = { ...(await overview("day")), kind: "test" };
      const subject = `${t.test}: ${msg.title}`;
      const { outcome } = await deliver(chosen.length ? chosen : ["email"], msg, subject);
      await log(p, { ...msg, title: subject }, outcome, false);
      return outcome;
    }

    /** "Bekijk de e-mail": the day's overview as it would arrive; nothing sent, nothing logged. */
    async function preview() {
      const msg = await overview("day");
      return { subject: msg.title, html: renderEmail(msg, { brand, t, locale, money, appUrl, subject: msg.title }) };
    }

    return { run, test, preview };
  }

  const one = input.test ?? input.preview;
  if (one) {
    const { data } = await db
      .from("notification_prefs")
      .select("*")
      .eq("user_id", one.user_id ?? "")
      .eq("org_id", one.org_id ?? "")
      .maybeSingle();
    // Someone who never saved gets the defaults: the evening overview by email.
    const p = (data ?? {
      user_id: one.user_id,
      org_id: one.org_id,
      business_id: null,
      locale: "nl",
      email: null,
      daily: ["email"],
      weekly: [],
      sales: [],
      errors: ["email"],
      low_stock: [],
      daily_hour: 20,
      low_percent: 25,
      sales_seen_at: null,
      daily_sent_on: null,
      weekly_sent_on: null,
    }) as Prefs;
    if (input.preview) {
      if (!data) {
        // Without a row the scope is unknown: the person's own membership says whose machines these are.
        const { data: member } = await db
          .from("memberships")
          .select("business_id")
          .eq("user_id", one.user_id ?? "")
          .eq("org_id", one.org_id ?? "")
          .maybeSingle();
        if (!member) return Response.json({ error: "not a member" }, { status: 404 });
        p.business_id = (member.business_id as string | null) ?? null;
      }
      return Response.json(await person(await context([p]), p).preview());
    }
    if (!data) return Response.json({ error: "no preferences" }, { status: 404 });
    return Response.json({ sent: await person(await context([p]), p).test() });
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
