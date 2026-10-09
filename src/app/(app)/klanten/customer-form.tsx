"use client";

import { useState, useTransition } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar } from "@/components/list-row";
import { Section } from "@/components/page-header";
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
    <Section title={m.customers.newTitle}>
      <div className="surface-card p-5 sm:p-6">
        <form action={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="company">{m.customers.company}</Label>
            <Input id="company" name="company" required placeholder={m.customers.companyPlaceholder} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">{m.customers.email}</Label>
            <Input id="email" name="email" type="email" required placeholder={m.customers.emailPlaceholder} />
          </div>
          {failed && (
            <p className="text-[13.5px] font-medium text-negative sm:col-span-2">
              {fmt(m.customers.failed, { reason: failed })}
            </p>
          )}
          <Button type="submit" disabled={isPending} className="mt-1 justify-self-start sm:col-span-2">
            {isPending ? m.customers.creating : m.customers.create}
          </Button>
        </form>

        {done && (
          // The one thing left to do by hand, set apart on a soft ground.
          <div className="mt-6 flex flex-col gap-3 rounded-2xl bg-surface p-4">
            <div className="flex items-center gap-3">
              <Avatar tone="positive" className="size-8 [&_svg]:size-4">
                <Check />
              </Avatar>
              <p className="min-w-0 text-[14px] font-semibold">{fmt(m.customers.created, { email: done })}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 basis-56 truncate rounded-xl bg-card px-3.5 py-2.5 font-mono text-[13px] shadow-[0_0_0_1px_var(--border)]">
                {signupUrl}
              </code>
              <Button variant="outline" onClick={copy} className="shrink-0">
                {copied ? <Check /> : <Copy />}
                {copied ? m.customers.copied : m.customers.copyLink}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}
