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
    <p role="status" className="text-sm">
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
      <div className="flex flex-col items-start gap-3">
        <Button onClick={() => set(true)} disabled={isPending}>
          <Link2 />
          {m.businesses.shareCreate}
        </Button>
        {lockedNote}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Input readOnly value={url} onFocus={(e) => e.target.select()} className="font-mono text-xs" />
        <Button type="button" variant="outline" onClick={copy} className="shrink-0">
          {copied ? <Check /> : <Copy />}
          {copied ? m.businesses.shareCopied : m.businesses.shareCopy}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
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
      <p className="text-xs text-muted-foreground">{m.businesses.shareRegenerateHint}</p>
      {lockedNote}
    </div>
  );
}
