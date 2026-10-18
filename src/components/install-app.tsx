"use client";

import { useEffect, useState } from "react";
import { Share, SquarePlus, X } from "lucide-react";
import { useI18n } from "@/i18n/client";

/** Android's offer to install, kept by the root layout's script before the page started. */
type InstallOffer = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

declare global {
  interface Window {
    __vendlyInstall?: InstallOffer | null;
  }
}

const DISMISSED = "vendly:install-dismissed";

function isIphone() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/**
 * Puts Vendly on the phone's home screen, so a filler opens it with one tap
 * like any app. Android installs with one button; an iPhone only lets Safari
 * do it, so there it says where to tap. Shown on a phone only, never inside the
 * installed app, and gone for good once closed.
 */
export function InstallApp() {
  const { m } = useI18n();
  const [way, setWay] = useState<"button" | "iphone" | null>(null);

  useEffect(() => {
    const installed = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    if (installed || !window.matchMedia("(pointer: coarse)").matches) return;
    try {
      if (localStorage.getItem(DISMISSED)) return;
    } catch {
      // No storage (a private tab): offer it anyway.
    }
    if (isIphone()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- decided once, after mounting: the server cannot see the phone
      setWay("iphone");
      return;
    }
    const offer = () => setWay(window.__vendlyInstall ? "button" : null);
    offer();
    window.addEventListener("vendly:installable", offer);
    return () => window.removeEventListener("vendly:installable", offer);
  }, []);

  if (!way) return null;

  function close() {
    setWay(null);
    try {
      localStorage.setItem(DISMISSED, "1");
    } catch {
      // Not kept: it comes back next time, nothing worse.
    }
  }

  async function install() {
    const offer = window.__vendlyInstall;
    if (!offer) return setWay(null);
    try {
      await offer.prompt();
      await offer.userChoice;
    } catch {
      // Already used or withdrawn: nothing to show.
    }
    // An offer works once. Turned down, Android makes a new one on a later visit and the card comes back.
    window.__vendlyInstall = null;
    setWay(null);
  }

  return (
    <section className="surface-card relative flex flex-col gap-3 p-4">
      <button
        type="button"
        onClick={close}
        aria-label={m.install.later}
        className="absolute right-1.5 top-1.5 flex size-11 items-center justify-center rounded-full text-muted-foreground active:bg-surface"
      >
        <X className="size-5" aria-hidden="true" />
      </button>
      <div className="flex items-center gap-3 pr-9">
        {/* eslint-disable-next-line @next/next/no-img-element -- the app icon itself, a few hundred bytes */}
        <img src="/pwa-icon/180" alt="" className="size-12 shrink-0 rounded-xl shadow-[var(--shadow-card)]" />
        <div className="min-w-0">
          <h2 className="text-[17px]">{m.install.title}</h2>
          <p className="mt-0.5 text-[14px] leading-snug text-muted-foreground">{m.install.hint}</p>
        </div>
      </div>
      {way === "button" ? (
        <button
          type="button"
          onClick={install}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-foreground text-[16px] font-semibold text-background active:scale-[0.99]"
        >
          <SquarePlus className="size-5" aria-hidden="true" />
          {m.install.button}
        </button>
      ) : (
        <ol className="flex flex-col gap-2 text-[15px]">
          <Step n={1}>
            {m.install.iphoneStep1} <Share className="inline size-[18px] -translate-y-px text-[#007aff]" aria-hidden="true" />
          </Step>
          <Step n={2}>
            {m.install.iphoneStep2} <SquarePlus className="inline size-[18px] -translate-y-px" aria-hidden="true" />
          </Step>
          <Step n={3}>{m.install.iphoneStep3}</Step>
        </ol>
      )}
    </section>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="tabular flex size-6 shrink-0 items-center justify-center rounded-full bg-surface text-[13px] font-semibold">{n}</span>
      <span className="pt-0.5 leading-snug">{children}</span>
    </li>
  );
}
