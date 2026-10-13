import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

type Message = { title: string; body: string; url: string; tag: string };

/**
 * A notification to every device of the operator that asked for them (the
 * same ones the evening digest reaches), never to a shop's. Uses the same
 * keys as the vendly-notify function. A device that has unsubscribed is
 * forgotten; anything else going wrong is swallowed: a missed notification
 * must never break the filler's round.
 */
export async function notifyOperators(orgId: string, message: Message): Promise<void> {
  try {
    const admin = createAdminClient();
    const [{ data: keys }, { data: subs }] = await Promise.all([
      admin.from("app_keys").select("name, value").in("name", ["vapid_subject", "vapid_public", "vapid_private"]),
      admin
        .from("push_subscriptions")
        .select("endpoint, p256dh, auth")
        .eq("org_id", orgId)
        .is("business_id", null),
    ]);
    const key = (name: string) => keys?.find((k) => k.name === name)?.value ?? "";
    if (!subs?.length || !key("vapid_private")) return;
    webpush.setVapidDetails(key("vapid_subject"), key("vapid_public"), key("vapid_private"));

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify(message),
          );
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          }
        }
      }),
    );
  } catch {
    // No notification is better than a failed round.
  }
}
