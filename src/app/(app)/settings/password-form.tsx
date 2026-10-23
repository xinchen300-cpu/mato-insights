"use client";

import { useEffect, useState } from "react";
import { SavedCheck } from "@/components/saved-check";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { useI18n } from "@/i18n/client";
import { isLeakedPassword } from "@/lib/pwned";
import { createClient } from "@/lib/supabase/client";

/**
 * A new password while signed in (Instellingen → Account, 23-10-2026), with the same checks as choosing one after a
 * reset: at least 8 characters, never one from a known data breach, never the current one.
 */
export function PasswordForm() {
  const { m } = useI18n();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<"leaked" | "same" | "weak" | "failed" | null>(null);
  const [done, setDone] = useState(false);
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(() => setDone(false), 2000);
    return () => window.clearTimeout(timer);
  }, [done]);

  async function submit(formData: FormData) {
    const password = String(formData.get("password") ?? "");
    setProblem(null);
    setBusy(true);
    try {
      if (await isLeakedPassword(password)) return setProblem("leaked");
      const { error } = await createClient().auth.updateUser({ password });
      if (error?.code === "same_password") return setProblem("same");
      if (error?.code === "weak_password") return setProblem("weak");
      if (error) return setProblem("failed");
      setDone(true);
      // An empty field again, so the new password is not left on screen.
      setKey((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  const problemText = {
    leaked: m.auth.passwordLeaked,
    same: m.auth.passwordSame,
    weak: m.auth.passwordWeak,
    failed: m.prefs.passwordFailed,
  };

  return (
    <form key={key} action={submit} className="flex flex-col gap-2 px-3 pb-3 sm:pl-[66px]">
      <label htmlFor="new-password" className="text-[14px] font-medium">
        {m.prefs.passwordNew}
      </label>
      <PasswordInput id="new-password" name="password" required minLength={8} autoComplete="new-password" className="max-w-sm" />
      <p className="text-[13px] text-muted-foreground">{m.auth.passwordHint}</p>
      {problem && (
        <p role="alert" className="text-[14px] font-medium text-negative">
          {problemText[problem]}
        </p>
      )}
      <Button type="submit" disabled={busy} className="mt-1 self-start">
        {busy ? m.prefs.passwordSaving : m.prefs.passwordChange}
      </Button>
      {done && <SavedCheck text={m.prefs.passwordChanged} onClose={() => setDone(false)} />}
    </form>
  );
}
