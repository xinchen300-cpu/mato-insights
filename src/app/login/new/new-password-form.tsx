"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/client";
import { isLeakedPassword } from "@/lib/pwned";
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
  const [leaked, setLeaked] = useState(false);
  // A password Supabase will not take is said under the field; only a lost session sends you back for a new link.
  const [refused, setRefused] = useState<"same" | "weak" | null>(null);

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
    const password = String(formData.get("password"));
    const isLeaked = await isLeakedPassword(password);
    setLeaked(isLeaked);
    setRefused(null);
    if (isLeaked) return setState("ready");
    const { error } = await createClient().auth.updateUser({ password });
    if (error?.code === "same_password" || error?.code === "weak_password") {
      setRefused(error.code === "same_password" ? "same" : "weak");
      return setState("ready");
    }
    if (error) return setState("expired");
    router.push("/");
    router.refresh();
  }

  // Until we know whether there is a session, show neither form: a password box
  // that cannot save anything is worse than a moment of nothing.
  if (state === "checking") {
    return (
      <div className={authCard}>
        <h1 className={authTitle}>{m.auth.resetChoose}</h1>
        <p className={authHint}>{m.common.loading}</p>
      </div>
    );
  }

  // The mailed link jumps to the project's Site URL, which may be anywhere. The
  // code inside it is still good, so it can be handed over by hand instead.
  if (state === "paste" || state === "expired") {
    return (
      <>
        <div className={authCard}>
          <h1 className={authTitle}>{m.auth.pasteTitle}</h1>
          <p className={authHint}>{m.auth.pasteHint}</p>
          <form action={submitPaste} className={authForm}>
            <div className={authField}>
              <Label htmlFor="link">{m.auth.pasteLabel}</Label>
              <Input id="link" name="link" required autoComplete="off" spellCheck={false} className={authInput} />
            </div>
            {state === "expired" && <p className={authError}>{m.auth.resetExpired}</p>}
            {pasteError && <p className={authError}>{m.auth.pasteBad}</p>}
            <Button type="submit" size="lg" className="mt-1 w-full">
              {m.auth.pasteGo}
            </Button>
          </form>
        </div>
        <p className={authAside}>
          <Link href="/login/forgot" className={authLink}>
            {m.auth.resetTitle}
          </Link>
        </p>
      </>
    );
  }

  return (
    <div className={authCard}>
      <h1 className={authTitle}>{m.auth.resetChoose}</h1>
      <p className={authHint}>{m.auth.resetChooseHint}</p>
      <form action={submit} className={authForm}>
        <div className={authField}>
          <Label htmlFor="password">{m.auth.password}</Label>
          <PasswordInput
            id="password"
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
            className={authInput}
          />
          <span className={authFieldHint}>{m.auth.passwordHint}</span>
        </div>
        {leaked && <p className={authError}>{m.auth.passwordLeaked}</p>}
        {refused && <p className={authError}>{refused === "same" ? m.auth.passwordSame : m.auth.passwordWeak}</p>}
        <Button type="submit" size="lg" disabled={state !== "ready"} className="mt-1 w-full">
          {state === "saving" ? m.auth.resetSaving : m.auth.resetSave}
        </Button>
      </form>
    </div>
  );
}
