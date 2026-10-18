"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";

export function ShareBox({ token }: { token: string }) {
  const { m } = useI18n();
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => setUrl(`${window.location.origin}/r/${token}`), [token]);

  async function share() {
    if (navigator.share) {
      await navigator.share({ title: m.refill.sheetTitle, url }).catch(() => {});
      return;
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{m.refill.shareHint}</p>
      <div className="flex items-center gap-2 rounded-xl bg-surface p-1 pl-3.5 focus-within:ring-3 focus-within:ring-ring/25">
        <input
          readOnly
          value={url}
          aria-label={m.refill.share}
          onFocus={(e) => e.currentTarget.select()}
          className="h-10 min-w-0 flex-1 bg-transparent font-mono text-base text-muted-foreground outline-none md:text-xs"
        />
        <Button variant="outline" size="icon" onClick={copy} aria-label={m.common.copy} className="shrink-0">
          {copied ? <Check className="text-positive" /> : <Copy />}
        </Button>
      </div>
      <Button onClick={share} className="h-12 w-full sm:h-10 sm:w-fit">
        <Share2 />
        {m.refill.share}
      </Button>
    </div>
  );
}
