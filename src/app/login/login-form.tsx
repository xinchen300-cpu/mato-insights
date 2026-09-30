"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
    <div className="border bg-card p-6 shadow-[0_18px_40px_rgb(28_24_18/0.1)] sm:p-8">
      <h1 className="text-3xl">{m.auth.welcome}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{m.auth.welcomeHint}</p>
      <form action={submit} className="mt-6 grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="email">{m.auth.email}</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">{m.auth.password}</Label>
          <Input id="password" name="password" type="password" required autoComplete="current-password" />
        </div>
        {linkDead && <p className="text-sm text-negative">{m.auth.resetExpired}</p>}
        {error && <p className="text-sm text-negative">{m.auth.wrongLogin}</p>}
        <Link
          href="/login/forgot"
          className="justify-self-start text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          {m.auth.forgot}
        </Link>
        <Button type="submit" size="lg" disabled={loading} className="mt-2">
          {loading ? m.auth.signingIn : m.auth.signIn}
        </Button>
      </form>
      {canSignUp && (
        <p className="mt-6 text-sm text-muted-foreground">
          {m.auth.noAccount}{" "}
          <Link href="/signup" className="font-semibold text-accent-foreground underline underline-offset-4">
            {m.auth.create}
          </Link>
        </p>
      )}
    </div>
  );
}
