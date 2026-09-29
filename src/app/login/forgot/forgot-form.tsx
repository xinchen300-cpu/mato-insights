"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/client";
import { createClient } from "@/lib/supabase/client";

export function ForgotForm() {
  const { m } = useI18n();
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(formData: FormData) {
    setLoading(true);
    await createClient().auth.resetPasswordForEmail(String(formData.get("email")).trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/login/new`,
    });
    // Said the same way whether or not the address exists, so this page cannot
    // be used to find out who has an account.
    setSent(true);
    setLoading(false);
  }

  return (
    <div className="border bg-card p-6 shadow-[0_18px_40px_rgb(28_24_18/0.1)] sm:p-8">
      <h1 className="text-3xl">{m.auth.resetTitle}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{sent ? m.auth.resetSent : m.auth.resetHint}</p>
      {!sent && (
        <form action={submit} className="mt-6 grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">{m.auth.email}</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <Button type="submit" size="lg" disabled={loading} className="mt-2">
            {loading ? m.auth.resetSending : m.auth.resetSend}
          </Button>
        </form>
      )}
      <p className="mt-6 text-sm text-muted-foreground">
        <Link href="/login" className="font-semibold text-accent-foreground underline underline-offset-4">
          {m.auth.toSignIn}
        </Link>
      </p>
    </div>
  );
}
