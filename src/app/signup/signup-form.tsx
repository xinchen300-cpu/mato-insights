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
import { SuccessCheck } from "@/components/motion/success";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { isLeakedPassword } from "@/lib/pwned";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { checkInvite } from "./actions";

export function SignupForm({
  invite,
  invitedEmail,
  intro,
  linkInvalid,
}: {
  invite: string | null;
  invitedEmail: string | null;
  intro: string | null;
  linkInvalid: boolean;
}) {
  const { m } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [exists, setExists] = useState(false);
  // Signed in straight away: the name to welcome while the app opens.
  const [welcome, setWelcome] = useState<string | null>(null);
  // Back here after signing in, so the invitation can be taken up.
  const signInHref = invite ? `/login?next=${encodeURIComponent(`/signup?invite=${invite}`)}` : "/login";

  async function submit(formData: FormData) {
    setLoading(true);
    setError(null);
    const email = String(formData.get("email"));
    const password = String(formData.get("password"));
    const name = String(formData.get("name") ?? "").trim().slice(0, 60);

    if (!(await checkInvite(email, invite))) {
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
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        // Without the token from the invitation link, the account is made but joins no organisation.
        // The name is how the operator sees who is filling.
        data: { ...(invite ? { invite } : {}), ...(name ? { name } : {}) },
      },
    });
    setLoading(false);
    // The address already has an account: sign in, then take up the invitation.
    // (With confirmation on, Supabase answers with a user without identities.)
    if (error?.code === "user_already_exists" || (data.user && data.user.identities?.length === 0)) {
      return setExists(true);
    }
    if (error) {
      // Supabase answers in technical English: say it in the reader's language.
      const known: Record<string, string> = {
        weak_password: m.auth.passwordWeak,
        email_address_invalid: m.auth.emailInvalid,
        over_email_send_rate_limit: m.auth.tooMany,
        over_request_rate_limit: m.auth.tooMany,
      };
      console.error(error);
      return setError(known[error.code ?? ""] ?? m.common.error);
    }
    // With email confirmation off, Supabase signs the user in right away. The
    // app starts opening at once; the welcome only fills the moment it takes.
    if (data.session) {
      setWelcome(name || email.split("@")[0]);
      window.location.href = "/";
    } else setSentTo(email);
  }

  if (welcome !== null) {
    return (
      <div className={authCard} role="status">
        <div className="flex flex-col items-center gap-3 py-3 text-center">
          <SuccessCheck sparks className="mb-2 size-16" />
          <h1 className={authTitle}>{fmt(m.auth.welcomeIn, { name: welcome })}</h1>
          <p className={authHint}>{m.auth.welcomeInHint}</p>
        </div>
      </div>
    );
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
        <p className={authHint}>{intro ?? m.auth.createHint}</p>
        {linkInvalid && <p className={authError}>{m.auth.inviteInvalid}</p>}
        <form action={submit} className={authForm}>
          <div className={authField}>
            <Label htmlFor="name">{m.auth.yourName}</Label>
            <Input id="name" name="name" required maxLength={60} autoComplete="given-name" className={authInput} />
          </div>
          <div className={authField}>
            <Label htmlFor="email">{m.auth.email}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className={authInput}
              defaultValue={invitedEmail ?? undefined}
              readOnly={Boolean(invitedEmail)}
            />
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
          {exists && (
            <p className={authError}>
              {m.auth.accountExists}{" "}
              <Link href={signInHref} className={authLink}>
                {m.auth.signIn}
              </Link>
            </p>
          )}
          <Button type="submit" size="lg" disabled={loading} className="mt-1 w-full">
            {loading ? m.auth.creating : m.auth.create}
          </Button>
        </form>
      </div>
      <p className={authAside}>
        {m.auth.haveAccount}{" "}
        <Link href={signInHref} className={authLink}>
          {m.auth.signIn}
        </Link>
      </p>
    </>
  );
}
