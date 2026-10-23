"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff } from "lucide-react";
import { Avatar } from "@/components/list-row";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { forgetDevice, rememberDevice } from "./actions";

/** base64url from the server to the byte array the browser wants. */
function toBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/**
 * Turns this browser into a device Vendly may reach. Nothing is sent from
 * here; it only hands over the address the browser vends.
 */
export function NotifyToggle({ publicKey, known }: { publicKey: string; known: number }) {
  const { m } = useI18n();
  const router = useRouter();
  const [state, setState] = useState<"unknown" | "off" | "on" | "blocked" | "unsupported" | "ios">("unknown");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Safari on an iPhone only offers push to a web app on the home screen:
    // say how to get there instead of "this browser cannot".
    const iphone = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return setState(iphone && !standalone ? "ios" : "unsupported");
    if (Notification.permission === "denied") return setState("blocked");

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        setState(sub ? "on" : "off");
        // A device switched on before it was known whose it is (23-10-2026): tied to this person now, so their own
        // choices in Meldingen reach it.
        if (sub && known === 0) {
          const json = sub.toJSON();
          void rememberDevice({ endpoint: sub.endpoint, p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "", label: navigator.userAgent.slice(0, 80) })
            .then(() => router.refresh())
            .catch(() => undefined);
        }
      })
      .catch(() => setState("unsupported"));
    // Once, on arrival: the count only says whether this person had a device yet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function turnOn() {
    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return setState("blocked");

        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: toBytes(publicKey),
        });
        const json = sub.toJSON();
        await rememberDevice({
          endpoint: sub.endpoint,
          p256dh: json.keys?.p256dh ?? "",
          auth: json.keys?.auth ?? "",
          label: navigator.userAgent.slice(0, 80),
        });
        setState("on");
        router.refresh();
      } catch {
        setState("off");
      }
    });
  }

  function turnOff() {
    startTransition(async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await forgetDevice(sub.endpoint);
          await sub.unsubscribe();
        }
        setState("off");
        router.refresh();
      } catch {
        setState("on");
      }
    });
  }

  if (state === "unsupported" || state === "blocked" || state === "ios") {
    return (
      <div className="flex min-h-16 items-center gap-3.5 rounded-xl px-3 py-3">
        <Avatar>
          <BellOff />
        </Avatar>
        <p className="min-w-0 text-[14px] text-muted-foreground">
          {state === "ios" ? m.settings.notifyIos : state === "unsupported" ? m.settings.notifyUnsupported : m.settings.notifyBlocked}
        </p>
      </div>
    );
  }

  // What this device does now on the left, the switch for it on the right;
  // on a phone the button drops under the sentence.
  return (
    <div className="flex flex-col gap-3 rounded-xl px-3 py-3 sm:min-h-16 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 items-center gap-3.5">
        <Avatar tone={state === "on" ? "positive" : "neutral"}>{state === "on" ? <Bell /> : <BellOff />}</Avatar>
        <p
          className={cn(
            "min-w-0",
            state === "on"
              ? "text-[15px] font-semibold tracking-[-0.01em]"
              : "text-[14px] leading-snug text-muted-foreground",
          )}
        >
          {state === "on" ? m.settings.notifyOnHere : m.settings.notifyOffHere}
        </p>
      </div>
      <div className="shrink-0 pl-[54px] sm:pl-0">
        {state === "on" ? (
          <Button variant="secondary" onClick={turnOff} disabled={isPending}>
            <BellOff />
            {m.settings.notifyOff}
          </Button>
        ) : (
          <Button onClick={turnOn} disabled={isPending || state === "unknown"}>
            <Bell />
            {m.settings.notifyOn}
          </Button>
        )}
      </div>
    </div>
  );
}
