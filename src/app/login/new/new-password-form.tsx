"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/client";
import { createClient } from "@/lib/supabase/client";

export function NewPasswordForm() {
  const { m } = useI18n();
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "expired">("idle");

  async function submit(formData: FormData) {
    setState("saving");
    const { error } = await createClient().auth.updateUser({
      password: String(formData.get("password")),
    });
    // Without the session from the mailed link there is nobody to update, so
    // this is also what an expired or already-used link looks like.
    if (error) return setState("expired");
    router.push("/");
    router.refresh();
  }

  return (
    <div className="border bg-card p-6 shadow-[0_18px_40px_rgb(28_24_18/0.1)] sm:p-8">
      <h1 className="text-3xl">{m.auth.resetChoose}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{m.auth.resetChooseHint}</p>
      <form action={submit} className="mt-6 grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="password">{m.auth.password}</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
          <span className="text-xs text-muted-foreground">{m.auth.passwordHint}</span>
        </div>
        {state === "expired" && <p className="text-sm text-negative">{m.auth.resetExpired}</p>}
        <Button type="submit" size="lg" disabled={state === "saving"} className="mt-2">
          {state === "saving" ? m.auth.resetSaving : m.auth.resetSave}
        </Button>
      </form>
      {state === "expired" && (
        <p className="mt-6 text-sm text-muted-foreground">
          <Link href="/login/forgot" className="font-semibold text-accent-foreground underline underline-offset-4">
            {m.auth.resetTitle}
          </Link>
        </p>
      )}
    </div>
  );
}
