"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Link2, RefreshCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { cheapestWith } from "@/lib/plans";
import { setBusinessShare } from "../actions";

// The customer's own page: a private link that shows only their sales.
export function ShareLink({
  businessId,
  token,
  operator,
}: {
  businessId: string;
  token: string | null;
  /** Only the operator has a subscription to point to. */
  operator: boolean;
}) {
  const { m } = useI18n();
  const router = useRouter();
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  const [locked, setLocked] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => setOrigin(window.location.origin), []);

  const url = token ? `${origin}/b/${token}` : "";

  function set(enabled: boolean) {
    setCopied(false);
    startTransition(async () => {
      const result = await setBusinessShare(businessId, enabled);
      if ("locked" in result) {
        setLocked(true);
        return;
      }
      router.refresh();
    });
  }

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
  }

  const lockedNote = locked && (
    <p role="status" className="text-[13.5px] leading-snug">
      {fmt(m.billing.locked, { plan: m.plans[cheapestWith("shareWithShops").id] })}{" "}
      {operator && (
        <Link href="/settings#abonnement" className="font-semibold underline underline-offset-4">
          {m.billing.lockedLink}
        </Link>
      )}
    </p>
  );

  if (!token) {
    return (
      <div className="flex flex-col items-stretch gap-3 sm:items-start">
        <Button onClick={() => set(true)} disabled={isPending} className="h-11 sm:h-10">
          <Link2 />
          {m.businesses.shareCreate}
        </Button>
        {lockedNote}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* The link itself, quiet and read-only, with the one thing to do with it next to it. */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
          className="border-transparent bg-surface font-mono text-[13px] md:text-[13px]"
        />
        <Button type="button" onClick={copy} className="h-11 shrink-0">
          {copied ? <Check /> : <Copy />}
          {copied ? m.businesses.shareCopied : m.businesses.shareCopy}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <a href={url} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <ExternalLink />
          {m.businesses.shareOpen}
        </a>
        <Button type="button" variant="ghost" size="sm" onClick={() => set(true)} disabled={isPending}>
          <RefreshCw />
          {m.businesses.shareRegenerate}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => set(false)} disabled={isPending}>
          {m.businesses.shareDisable}
        </Button>
      </div>
      <p className="text-[13px] leading-snug text-muted-foreground">{m.businesses.shareRegenerateHint}</p>
      {lockedNote}
    </div>
  );
}
