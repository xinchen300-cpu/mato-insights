"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authCard, authError, authHint, authTitle } from "@/components/auth-frame";
import { Button, buttonVariants } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { cn } from "@/lib/utils";
import { claimInvite, type ClaimResult } from "./actions";

/**
 * Signed in and holding an invitation link: one button to join, after saying
 * plainly which organisation, as what, and for which address. Joining never
 * happens just by opening a link.
 */
export function ClaimInvite({
  token,
  invitation,
  you,
}: {
  token: string;
  invitation: { email: string; orgName: string; role: string } | null;
  you: string;
}) {
  const { m } = useI18n();
  const router = useRouter();
  const [result, setResult] = useState<ClaimResult | null>(null);
  const [pending, startTransition] = useTransition();

  const otherEmail = invitation && invitation.email.toLowerCase() !== you.toLowerCase();
  const problem = !invitation
    ? m.auth.inviteInvalid
    : otherEmail || result === "other_email"
      ? fmt(m.auth.claimOtherEmail, { email: invitation.email, you })
      : result === "has_org"
        ? m.auth.claimHasOrg
        : result && result !== "ok"
          ? m.auth.claimFailed
          : null;

  return (
    <div className={authCard}>
      <h1 className={authTitle}>{m.auth.claimTitle}</h1>
      {invitation && !otherEmail && (
        <p className={authHint}>
          {fmt(m.auth.claimHint, { org: invitation.orgName, email: invitation.email, role: invitation.role.toLowerCase() })}
        </p>
      )}
      {problem && <p className={cn(invitation && !otherEmail ? authError : authHint)}>{problem}</p>}
      {invitation && !otherEmail && result !== "has_org" ? (
        <Button
          size="lg"
          className="mt-7 w-full"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const outcome = await claimInvite(token);
              setResult(outcome);
              if (outcome === "ok") {
                router.replace("/");
                router.refresh();
              }
            })
          }
        >
          {pending ? m.auth.claiming : m.auth.claimButton}
        </Button>
      ) : (
        <form action="/auth/signout" method="post" className="mt-7">
          <button type="submit" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "w-full")}>
            {m.auth.signOut}
          </button>
        </form>
      )}
      {result === "ok" && (
        <Link href="/" className={cn(buttonVariants({ variant: "ghost" }), "mt-2 w-full")}>
          {m.auth.toApp}
        </Link>
      )}
    </div>
  );
}
