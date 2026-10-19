"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { Check, Copy, Link2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { producerLink } from "./actions";

const noChange = () => () => {};

/** The kitchen's link: made on the first tap, then copied or shared like the round's own link. */
export function KitchenLink({ producerId, initialToken, title }: { producerId: string; initialToken: string | null; title: string }) {
  const { m } = useI18n();
  const t = m.kitchen;
  const [token, setToken] = useState(initialToken);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  // The site's own address, known in the browser only: empty on the server.
  const origin = useSyncExternalStore(noChange, () => window.location.origin, () => "");
  const url = token && origin ? `${origin}/p/${token}` : "";

  function make() {
    setFailed(false);
    startTransition(async () => {
      try {
        setToken(await producerLink(producerId));
      } catch {
        setFailed(true);
      }
    });
  }

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function share() {
    if (navigator.share) {
      await navigator.share({ title, url }).catch(() => {});
      return;
    }
    await copy();
  }

  return (
    <div className="surface-card flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex flex-col gap-1">
        <p className="text-[15px] font-semibold">{t.link}</p>
        <p className="text-[13.5px] leading-snug text-muted-foreground">{t.linkHint}</p>
      </div>
      {token ? (
        <>
          <div className="flex items-center gap-2 rounded-xl bg-surface p-1 pl-3.5">
            <input
              readOnly
              value={url}
              aria-label={t.link}
              onFocus={(e) => e.currentTarget.select()}
              className="h-10 min-w-0 flex-1 bg-transparent font-mono text-base text-muted-foreground outline-none md:text-xs"
            />
            <Button variant="outline" size="icon" onClick={copy} aria-label={copied ? t.copied : t.copy} className="shrink-0">
              {copied ? <Check className="text-positive" /> : <Copy />}
            </Button>
          </div>
          <Button onClick={share} className="h-12 w-full sm:h-10 sm:w-fit">
            <Share2 />
            {t.share}
          </Button>
        </>
      ) : (
        <Button onClick={make} disabled={pending} className="h-12 w-full sm:h-10 sm:w-fit">
          <Link2 />
          {t.makeLink}
        </Button>
      )}
      {failed && <p className="text-[14px] font-medium text-negative">{m.common.error}</p>}
    </div>
  );
}
