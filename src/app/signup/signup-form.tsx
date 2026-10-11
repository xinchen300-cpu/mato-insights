"use client";

import { useState } from "react";
import Link from "next/link";
import {
  authAside,
  authCard,
  authError,
  authField,
  authFieldHint,
  authForm,
  authHint,
  authInput,
  authLink,
  authTitle,
} from "@/components/auth-frame";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { isLeakedPassword } from "@/lib/pwned";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
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
    const password = String(formData.get("password"));

    if (!(await checkInvite(email))) {
      setLoading(false);
      return setError(m.auth.notInvited);
    }
    if (await isLeakedPassword(password)) {
      setLoading(false);
      return setError(m.auth.passwordLeaked);
    }

    const { data, error } = await createClient().auth.signUp({
      email,
      password,
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
      <div className={authCard}>
        <h1 className={authTitle}>{m.auth.checkInbox}</h1>
        <p className={authHint}>{fmt(m.auth.checkInboxHint, { email: sentTo })}</p>
        <Link href="/login" className={cn(buttonVariants({ size: "lg" }), "mt-7 w-full")}>
          {m.auth.toSignIn}
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className={authCard}>
        <h1 className={authTitle}>{m.auth.createAccount}</h1>
        <p className={authHint}>{m.auth.createHint}</p>
        <form action={submit} className={authForm}>
          <div className={authField}>
            <Label htmlFor="email">{m.auth.email}</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" className={authInput} />
          </div>
          <div className={authField}>
            <Label htmlFor="password">{m.auth.password}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className={authInput}
            />
            <p className={authFieldHint}>{m.auth.passwordHint}</p>
          </div>
          {error && <p className={authError}>{error}</p>}
          <Button type="submit" size="lg" disabled={loading} className="mt-1 w-full">
            {loading ? m.auth.creating : m.auth.create}
          </Button>
        </form>
      </div>
      <p className={authAside}>
        {m.auth.haveAccount}{" "}
        <Link href="/login" className={authLink}>
          {m.auth.signIn}
        </Link>
      </p>
    </>
  );
}
