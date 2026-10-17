"use client";

import { useState, useTransition } from "react";
import { UserPlus } from "lucide-react";
import { Avatar, RowList, initial } from "@/components/list-row";
import { Section } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import type { TeamInvite, TeamMember } from "@/lib/data";
import type { Role } from "@/lib/org";
import { cn } from "@/lib/utils";
import { inviteTeamMember, removeMember, revokeInvite } from "./team-actions";

/**
 * Who is in, who is invited, and a way to bring in a filler or a manager. No
 * mail goes out yet: the operator sends the signup link themselves.
 */
export function TeamPanel({
  members,
  invites,
  youId,
  signupUrl,
}: {
  members: TeamMember[];
  invites: TeamInvite[];
  youId: string | null;
  signupUrl: string;
}) {
  const { m } = useI18n();
  const t = m.team;
  const roleLabel: Record<Role, string> = {
    owner: t.roleOwner,
    admin: t.roleAdmin,
    member: t.roleMember,
    filler: t.roleFiller,
  };

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"filler" | "admin">("filler");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ email: string; link: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  // The form stays folded behind one button until someone is to be invited.
  const [inviting, setInviting] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await inviteTeamMember(email, role);
      if (result.ok) {
        setSent({ email: result.email, link: linkFor(result.token) });
        setEmail("");
        setCopied(null);
      } else {
        setError(result.reason === "email" ? t.errEmail : result.reason === "taken" ? t.errTaken : t.errFailed);
      }
    });
  }

  /** The signup link with the invitation's token, which is what claims the seat. */
  const linkFor = (token: string | null) => (token ? `${signupUrl}?invite=${encodeURIComponent(token)}` : signupUrl);

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(link);
    } catch {
      setCopied(null);
    }
  }

  return (
    <Section title={t.title} hint={t.hint}>
      <RowList>
        {members.map((member) => {
          const you = member.userId === youId;
          const removable = !you && member.role !== "owner";
          return (
            <li key={member.userId}>
              <TeamRow
                leading={<Avatar>{initial(member.email ?? "?")}</Avatar>}
                title={
                  <>
                    {member.email ?? m.common.unknown}
                    {you && <span className="font-normal text-muted-foreground"> · {t.you}</span>}
                  </>
                }
                subtitle={member.businessName ? `${roleLabel[member.role]} · ${member.businessName}` : roleLabel[member.role]}
                actions={
                  removable ? (
                    confirming === member.userId ? (
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={pending}
                        onClick={() => startTransition(async () => removeMember(member.userId))}
                      >
                        {t.removeYes}
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => setConfirming(member.userId)}>
                        {t.remove}
                      </Button>
                    )
                  ) : undefined
                }
                note={confirming === member.userId ? fmt(t.removeConfirm, { email: member.email ?? "" }) : undefined}
              />
            </li>
          );
        })}
        {invites.map((invite) => (
          <li key={invite.email}>
            <TeamRow
              leading={<Avatar tone="warning">{initial(invite.email)}</Avatar>}
              title={invite.email}
              subtitle={`${roleLabel[invite.role]} · ${t.invitedBadge}`}
              actions={
                <>
                  <Button variant="ghost" size="sm" onClick={() => copyLink(linkFor(invite.token))}>
                    {copied === linkFor(invite.token) ? t.copied : t.copyLink}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => startTransition(async () => revokeInvite(invite.email))}
                  >
                    {t.revoke}
                  </Button>
                </>
              }
            />
          </li>
        ))}
      </RowList>

      {!inviting && !sent ? (
        <button
          type="button"
          onClick={() => setInviting(true)}
          className="surface-card hover-surface flex min-h-16 w-full items-center gap-3.5 px-5 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
        >
          <Avatar tone="gold">
            <UserPlus />
          </Avatar>
          <span className="text-[15px] font-semibold tracking-[-0.01em]">{t.inviteTitle}</span>
        </button>
      ) : (
        <form onSubmit={submit} className="surface-card flex flex-col gap-4 p-5">
          <p className="text-[15px] font-semibold">{t.inviteTitle}</p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="team-email">{t.email}</Label>
            <Input
              id="team-email"
              type="email"
              autoComplete="off"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="sr-only">{t.title}</legend>
            {(["filler", "admin"] as const).map((option) => (
              <label
                key={option}
                className={cn(
                  "flex cursor-pointer flex-col gap-0.5 rounded-xl border px-4 py-3 transition-colors",
                  role === option ? "border-foreground bg-card" : "border-border hover:bg-surface/60",
                )}
              >
                <input
                  type="radio"
                  name="team-role"
                  value={option}
                  checked={role === option}
                  onChange={() => setRole(option)}
                  className="sr-only"
                />
                <span className="text-[14.5px] font-semibold">{option === "filler" ? t.asFiller : t.asAdmin}</span>
                <span className="text-[13px] text-muted-foreground">
                  {option === "filler" ? t.asFillerHint : t.asAdminHint}
                </span>
              </label>
            ))}
          </fieldset>
          {error && <p className="text-sm text-negative">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending} className="flex-1 sm:flex-none">
              {pending ? t.inviting : t.invite}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setInviting(false);
                setSent(null);
                setError(null);
              }}
            >
              {sent ? m.common.close : m.common.cancel}
            </Button>
          </div>

          {sent && (
            <div className="flex flex-col gap-2 rounded-xl bg-surface p-4">
              <p className="text-sm font-semibold">{fmt(t.sent, { email: sent.email })}</p>
              <p className="text-sm text-muted-foreground">{t.sendLink}</p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="min-w-0 select-all break-all rounded-lg bg-card px-3 py-2 text-[13px]">{sent.link}</code>
                <Button type="button" variant="outline" size="sm" onClick={() => copyLink(sent.link)}>
                  {copied === sent.link ? t.copied : t.copy}
                </Button>
              </div>
            </div>
          )}
        </form>
      )}
    </Section>
  );
}

/**
 * One person in the team: who and what on top, the actions under the address
 * on a phone and beside it on a wider screen, so a long address never gets
 * squeezed to a few letters. A question about the row goes under it, full width.
 */
function TeamRow({
  leading,
  title,
  subtitle,
  actions,
  note,
}: {
  leading: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  note?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3.5">
      <div className="flex min-w-0 flex-1 items-center gap-3.5">
        {leading}
        <span className="min-w-0 flex-1">
          <span className="block break-words text-[15px] font-semibold tracking-[-0.01em]">{title}</span>
          {subtitle && <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{subtitle}</span>}
        </span>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-1 pl-[46px] sm:pl-0">{actions}</div>}
      {note && <p className="pl-[54px] text-[13px] text-muted-foreground sm:basis-full">{note}</p>}
    </div>
  );
}
