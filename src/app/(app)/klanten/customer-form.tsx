"use client";

import { useState, useTransition } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/page-header";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { createCustomer } from "./actions";

/**
 * Setting up a customer is two things at once — their own environment and the
 * invitation that lets them in — so it is one form, and what comes back is the
 * only thing left to do by hand: the link to send them.
 */
export function CustomerForm({ signupUrl }: { signupUrl: string }) {
  const { m } = useI18n();
  const [done, setDone] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setFailed(null);
    setDone(null);
    startTransition(async () => {
      const result = await createCustomer(formData);
      if (result.ok) setDone(result.email);
      else setFailed(result.reason);
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(signupUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Some browsers refuse without a gesture they recognise; the link stays
      // on screen to select by hand.
    }
  }

  return (
    <Panel title={m.customers.newTitle}>
      <form action={submit} className="grid gap-4 sm:max-w-md">
        <div className="grid gap-2">
          <Label htmlFor="company">{m.customers.company}</Label>
          <Input id="company" name="company" required placeholder={m.customers.companyPlaceholder} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email">{m.customers.email}</Label>
          <Input id="email" name="email" type="email" required placeholder={m.customers.emailPlaceholder} />
        </div>
        {failed && <p className="text-sm text-negative">{fmt(m.customers.failed, { reason: failed })}</p>}
        <Button type="submit" disabled={isPending} className="justify-self-start">
          {isPending ? m.customers.creating : m.customers.create}
        </Button>
      </form>

      {done && (
        <div className="mt-5 border border-positive/40 bg-surface p-4">
          <p className="text-sm font-semibold">{fmt(m.customers.created, { email: done })}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <code className="min-w-0 flex-1 truncate bg-card px-3 py-2 font-mono text-sm">{signupUrl}</code>
            <Button variant="outline" size="sm" onClick={copy} className="shrink-0">
              {copied ? <Check /> : <Copy />}
              {copied ? m.customers.copied : m.customers.copyLink}
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}
