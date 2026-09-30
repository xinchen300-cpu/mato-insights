"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/client";
import { createClient } from "@/lib/supabase/client";

/** The one-time code out of a mailed link, whatever shape the link has. */
function tokenIn(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const found = url.searchParams.get("token") ?? url.searchParams.get("token_hash");
    if (found) return found;
    const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
    return hash.get("token") ?? hash.get("token_hash");
  } catch {
    // Not a URL: perhaps the code itself was pasted.
    return /^[A-Za-z0-9._-]{20,}$/.test(trimmed) ? trimmed : null;
  }
}

export function NewPasswordForm() {
  const { m } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState<"checking" | "ready" | "paste" | "saving" | "expired">("checking");
  const [pasteError, setPasteError] = useState(false);

  /** Trade a one-time code for a session, without any redirect. */
  async function use(token: string) {
    const { error } = await createClient().auth.verifyOtp({ token_hash: token, type: "recovery" });
    if (error) {
      setState("expired");
      return false;
    }
    setState("ready");
    return true;
  }

  useEffect(() => {
    const fromUrl = searchParams.get("token");
    if (fromUrl) {
      void use(fromUrl);
      return;
    }
    // Arrived through the callback? Then there is already a session to change.
    createClient()
      .auth.getSession()
      .then(({ data }) => setState(data.session ? "ready" : "paste"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function submitPaste(formData: FormData) {
    const token = tokenIn(String(formData.get("link") ?? ""));
    if (!token) {
      setPasteError(true);
      return;
    }
    setPasteError(false);
    setState("checking");
    void use(token);
  }

  async function submit(formData: FormData) {
    setState("saving");
    const { error } = await createClient().auth.updateUser({
      password: String(formData.get("password")),
    });
    if (error) return setState("expired");
    router.push("/");
    router.refresh();
  }

  // Until we know whether there is a session, show neither form: a password box
  // that cannot save anything is worse than a moment of nothing.
  if (state === "checking") {
    return (
      <div className="border bg-card p-6 shadow-[0_18px_40px_rgb(28_24_18/0.1)] sm:p-8">
        <h1 className="text-3xl">{m.auth.resetChoose}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{m.common.loading}</p>
      </div>
    );
  }

  // The mailed link jumps to the project's Site URL, which may be anywhere. The
  // code inside it is still good, so it can be handed over by hand instead.
  if (state === "paste" || state === "expired") {
    return (
      <div className="border bg-card p-6 shadow-[0_18px_40px_rgb(28_24_18/0.1)] sm:p-8">
        <h1 className="text-3xl">{m.auth.pasteTitle}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{m.auth.pasteHint}</p>
        <form action={submitPaste} className="mt-6 grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="link">{m.auth.pasteLabel}</Label>
            <Input id="link" name="link" required autoComplete="off" spellCheck={false} />
          </div>
          {state === "expired" && <p className="text-sm text-negative">{m.auth.resetExpired}</p>}
          {pasteError && <p className="text-sm text-negative">{m.auth.pasteBad}</p>}
          <Button type="submit" size="lg" className="mt-2">
            {m.auth.pasteGo}
          </Button>
        </form>
        <p className="mt-6 text-sm text-muted-foreground">
          <Link href="/login/forgot" className="font-semibold text-accent-foreground underline underline-offset-4">
            {m.auth.resetTitle}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="border bg-card p-6 shadow-[0_18px_40px_rgb(28_24_18/0.1)] sm:p-8">
      <h1 className="text-3xl">{m.auth.resetChoose}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{m.auth.resetChooseHint}</p>
      <form action={submit} className="mt-6 grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="password">{m.auth.password}</Label>
          <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
          <span className="text-xs text-muted-foreground">{m.auth.passwordHint}</span>
        </div>
        <Button type="submit" size="lg" disabled={state !== "ready"} className="mt-2">
          {state === "saving" ? m.auth.resetSaving : m.auth.resetSave}
        </Button>
      </form>
    </div>
  );
}
