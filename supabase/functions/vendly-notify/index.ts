// The evening line. Runs once a day and tells every device that asked to be
// told what still needs a decision. Says nothing when there is nothing to say.
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Digest = { machines_low: number; slots_low: number; expired: number; offline: number };

/** Dutch, short, and only the parts that are not zero. */
function lineFor(d: Digest): string | null {
  const parts: string[] = [];
  if (d.offline > 0) parts.push(d.offline === 1 ? "1 terminal offline" : `${d.offline} terminals offline`);
  if (d.expired > 0) parts.push(`${d.expired} stuks over datum`);
  if (d.machines_low > 0) {
    parts.push(
      d.machines_low === 1
        ? `1 automaat loopt leeg (${d.slots_low} vakken)`
        : `${d.machines_low} automaten lopen leeg (${d.slots_low} vakken)`,
    );
  }
  return parts.length ? parts.join(" · ") : null;
}

Deno.serve(async (req) => {
  const db = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: keys } = await db.from("app_keys").select("name, value");
  const key = (name: string) => keys?.find((k) => k.name === name)?.value ?? "";

  // Called by pg_cron with the shared secret; nothing else gets in.
  const given = req.headers.get("x-notify-secret") ?? "";
  if (!key("notify_secret") || given !== key("notify_secret")) {
    return new Response("forbidden", { status: 403 });
  }

  const dryRun = new URL(req.url).searchParams.get("dry") === "1";
  webpush.setVapidDetails(key("vapid_subject"), key("vapid_public"), key("vapid_private"));

  const { data: orgs } = await db.from("organizations").select("id, name");
  const results: { org: string; audience: string; line: string | null; sent: number; dropped: number }[] = [];

  for (const org of orgs ?? []) {
    const { data: subs } = await db.from("push_subscriptions").select("*").eq("org_id", org.id);
    if (!subs?.length) continue;

    // A shop hears about its own machines, the operator about the whole fleet.
    // So: one line per audience, not one line per organisation.
    const audienceOf = (sub: { business_id: string | null }) => sub.business_id ?? "";
    const audiences = [...new Set(subs.map(audienceOf))];

    for (const audience of audiences) {
      const { data } = await db.rpc("evening_digest", {
        target_org: org.id,
        target_business: audience || null,
      });
      const digest = (Array.isArray(data) ? data[0] : data) as Digest | undefined;
      const body = digest ? lineFor(digest) : null;
      const label = audience || "hele vloot";
      if (!body || dryRun) {
        results.push({ org: org.name, audience: label, line: body, sent: 0, dropped: 0 });
        continue;
      }

      let sent = 0;
      let dropped = 0;
      for (const sub of subs.filter((s) => audienceOf(s) === audience)) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({ title: "MATO Info", body, url: "/", tag: "evening" }),
          );
          sent += 1;
          await db.from("push_subscriptions").update({ last_sent_at: new Date().toISOString(), failures: 0 }).eq("endpoint", sub.endpoint);
        } catch (error) {
          // A browser that unsubscribed answers 404 or 410; that row is dead.
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await db.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
            dropped += 1;
          } else {
            await db.from("push_subscriptions").update({ failures: (sub.failures ?? 0) + 1 }).eq("endpoint", sub.endpoint);
          }
        }
      }
      results.push({ org: org.name, audience: label, line: body, sent, dropped });
    }
  }

  return new Response(JSON.stringify({ results }), { headers: { "Content-Type": "application/json" } });
});
