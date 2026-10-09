"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  authAside,
  authCard,
  authError,
  authField,
  authForm,
  authHint,
  authInput,
  authLink,
  authTitle,
} from "@/components/auth-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/client";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ canSignUp }: { canSignUp: boolean }) {
  const { m } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  // Supabase reports a dead mail link either in the query string or, on the
  // implicit flow, only in the fragment — which never reaches the server.
  const [linkDead, setLinkDead] = useState(false);

  useEffect(() => {
    const fromQuery = searchParams.get("error_code");
    const fromHash = new URLSearchParams(window.location.hash.slice(1)).get("error_code");
    if (fromQuery || fromHash) setLinkDead(true);
  }, [searchParams]);

  async function submit(formData: FormData) {
    setLoading(true);
    setError(false);
    const { error } = await createClient().auth.signInWithPassword({
      email: String(formData.get("email")),
      password: String(formData.get("password")),
    });
    if (error) {
      setError(true);
      setLoading(false);
      return;
    }
    const next = searchParams.get("next");
    router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    router.refresh();
  }

  return (
    <>
      <div className={authCard}>
        <h1 className={authTitle}>{m.auth.welcome}</h1>
        <p className={authHint}>{m.auth.welcomeHint}</p>
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
              autoComplete="current-password"
              className={authInput}
            />
            {/* Right under the field it is about, so it is found exactly when it is needed. */}
            <Link
              href="/login/forgot"
              className="justify-self-end rounded-full py-0.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {m.auth.forgot}
            </Link>
          </div>
          {linkDead && <p className={authError}>{m.auth.resetExpired}</p>}
          {error && <p className={authError}>{m.auth.wrongLogin}</p>}
          <Button type="submit" size="lg" disabled={loading} className="mt-1 w-full">
            {loading ? m.auth.signingIn : m.auth.signIn}
          </Button>
        </form>
      </div>
      {canSignUp && (
        <p className={authAside}>
          {m.auth.noAccount}{" "}
          <Link href="/signup" className={authLink}>
            {m.auth.create}
          </Link>
        </p>
      )}
    </>
  );
}
