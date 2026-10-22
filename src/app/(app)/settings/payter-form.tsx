"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { addPayterAccount, connectPayter, removePayterAccount } from "./actions";

/**
 * The MyPayter login, the same three boxes as on mypayter.com. Payter checks
 * it before it is kept, and a refusal says what to look at instead of
 * failing silently. With `extra` it adds a further Payter account to the
 * business (22-10-2026) and goes on to the picker, where the operator says
 * which of that account's terminals are theirs.
 */
export function PayterForm({ submitLabel, extra = false }: { submitLabel: string; extra?: boolean }) {
  const { m } = useI18n();
  const router = useRouter();
  // Two of these can share the Settings page: the own login and a further account.
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        const result = await (extra ? addPayterAccount(formData) : connectPayter(formData));
        if (result.ok) {
          setSaved(true);
          if (extra) router.push("/terminals");
        } else if (result.reason === "same") setError(m.settings.addAccountSame);
        else setError(result.reason === "unreachable" ? m.settings.payterUnreachable : m.settings.payterFailed);
      } catch {
        setError(m.settings.payterUnreachable);
      }
    });
  }

  return (
    <form action={submit} className="grid max-w-md gap-4">
      <div className="grid gap-2">
        <Label htmlFor={`${id}-username`}>{m.settings.username}</Label>
        <Input
          id={`${id}-username`}
          name="username"
          required
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-password`}>{m.settings.password}</Label>
        <Input id={`${id}-password`} name="password" type="password" required autoComplete="off" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-domain`}>{m.settings.domain}</Label>
        <Input
          id={`${id}-domain`}
          name="domain"
          required
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby={`${id}-domain-hint`}
        />
        <p id={`${id}-domain-hint`} className="text-[13px] leading-snug text-muted-foreground">
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

/** Stops syncing a further Payter account. Its machines and the sales already in stay. */
export function RemovePayterAccount({ loginId, domain }: { loginId: string; domain: string }) {
  const { m } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function remove() {
    if (!window.confirm(fmt(m.settings.removeAccountConfirm, { domain }))) return;
    startTransition(async () => {
      await removePayterAccount(loginId);
      router.refresh();
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={remove} disabled={pending} className="shrink-0">
      {m.settings.removeAccount}
    </Button>
  );
}
