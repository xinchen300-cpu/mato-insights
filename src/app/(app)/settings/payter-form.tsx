"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/client";
import { connectPayter } from "./actions";

/**
 * The MyPayter login, the same three boxes as on mypayter.com. Payter checks
 * it before it is kept, and a refusal says what to look at instead of
 * failing silently.
 */
export function PayterForm({ submitLabel }: { submitLabel: string }) {
  const { m } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        const result = await connectPayter(formData);
        if (result.ok) setSaved(true);
        else setError(result.reason === "unreachable" ? m.settings.payterUnreachable : m.settings.payterFailed);
      } catch {
        setError(m.settings.payterUnreachable);
      }
    });
  }

  return (
    <form action={submit} className="grid max-w-md gap-4">
      <div className="grid gap-2">
        <Label htmlFor="username">{m.settings.username}</Label>
        <Input
          id="username"
          name="username"
          required
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">{m.settings.password}</Label>
        <Input id="password" name="password" type="password" required autoComplete="off" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="domain">{m.settings.domain}</Label>
        <Input
          id="domain"
          name="domain"
          required
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby="domain-hint"
        />
        <p id="domain-hint" className="text-[13px] leading-snug text-muted-foreground">
          {m.settings.domainHint}
        </p>
      </div>
      {error && <p className="text-[13.5px] font-medium text-negative">{error}</p>}
      {saved && <p className="text-[13.5px] font-medium text-positive">{m.settings.payterSaved}</p>}
      <Button type="submit" className="mt-1 w-fit" disabled={pending}>
        {submitLabel}
      </Button>
    </form>
  );
}
