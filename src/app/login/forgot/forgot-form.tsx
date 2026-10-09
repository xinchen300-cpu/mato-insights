"use client";

import { useState } from "react";
import Link from "next/link";
import { authAside, authCard, authField, authForm, authInput, authLink, authTitle } from "@/components/auth-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/client";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export function ForgotForm() {
  const { m } = useI18n();
  const [state, setState] = useState<"idle" | "sending" | "sent" | "tooOften">("idle");

  async function submit(formData: FormData) {
    setState("sending");
    const { error } = await createClient().auth.resetPasswordForEmail(String(formData.get("email")).trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/login/new`,
    });
    // Whether the address exists stays unsaid, so this page cannot be used to
    // find out who has an account. But being refused for sending too much says
    // nothing about any address, and hiding it behind "sent" leaves someone
    // waiting for a mail that was never going to come.
    const tooOften = error?.status === 429 || /rate limit|too many/i.test(error?.message ?? "");
    setState(tooOften ? "tooOften" : "sent");
  }

  return (
    <>
      <div className={authCard}>
        <h1 className={authTitle}>{m.auth.resetTitle}</h1>
        <p
          className={cn(
            "mt-2 text-[15px] leading-relaxed",
            state === "tooOften" ? "font-medium text-negative" : "text-muted-foreground",
          )}
        >
          {state === "tooOften" ? m.auth.resetTooOften : state === "sent" ? m.auth.resetSent : m.auth.resetHint}
        </p>
        {state !== "sent" && (
          <form action={submit} className={authForm}>
            <div className={authField}>
              <Label htmlFor="email">{m.auth.email}</Label>
              <Input id="email" name="email" type="email" required autoComplete="email" className={authInput} />
            </div>
            <Button type="submit" size="lg" disabled={state === "sending"} className="mt-1 w-full">
              {state === "sending" ? m.auth.resetSending : m.auth.resetSend}
            </Button>
          </form>
        )}
      </div>
      <p className={authAside}>
        <Link href="/login" className={authLink}>
          {m.auth.toSignIn}
        </Link>
      </p>
    </>
  );
}
