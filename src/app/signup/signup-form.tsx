"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { createClient } from "@/lib/supabase/client";
import { checkInvite } from "./actions";

export function SignupForm() {
  const { m } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setLoading(true);
    setError(null);
    const email = String(formData.get("email"));

    if (!(await checkInvite(email))) {
      setLoading(false);
      return setError(m.auth.notInvited);
    }

    const { data, error } = await createClient().auth.signUp({
      email,
      password: String(formData.get("password")),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);
    if (error) return setError(error.message);
    // With email confirmation off, Supabase signs the user in right away.
    if (data.session) window.location.href = "/";
    else setSentTo(email);
  }

  if (sentTo) {
    return (
      <div className="border bg-card p-6 sm:p-8">
        <h1 className="text-3xl">{m.auth.checkInbox}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{fmt(m.auth.checkInboxHint, { email: sentTo })}</p>
        <Link href="/login" className={`${buttonVariants()} mt-6`}>
          {m.auth.toSignIn}
        </Link>
      </div>
    );
  }

  return (
    <div className="border bg-card p-6 shadow-[0_18px_40px_rgb(28_24_18/0.1)] sm:p-8">
      <h1 className="text-3xl">{m.auth.createAccount}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{m.auth.createHint}</p>
      <form action={submit} className="mt-6 grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="email">{m.auth.email}</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">{m.auth.password}</Label>
          <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
          <p className="text-xs text-muted-foreground">{m.auth.passwordHint}</p>
        </div>
        {error && <p className="text-sm text-negative">{error}</p>}
        <Button type="submit" size="lg" disabled={loading} className="mt-2">
          {loading ? m.auth.creating : m.auth.create}
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted-foreground">
        {m.auth.haveAccount}{" "}
        <Link href="/login" className="font-semibold text-accent-foreground underline underline-offset-4">
          {m.auth.signIn}
        </Link>
      </p>
    </div>
  );
}
