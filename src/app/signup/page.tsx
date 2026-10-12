import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth-frame";
import { fmt } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { canSignUp, invitationFor } from "@/lib/signup";
import { createClient } from "@/lib/supabase/server";
import { ClaimInvite } from "./claim-invite";
import { SignupForm } from "./signup-form";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.auth.createAccount };
}

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { m } = await getI18n();
  // The invitation link's token: what attaches the account to its organisation.
  const { invite } = await searchParams;
  const token = invite && /^[A-Za-z0-9_-]{16,64}$/.test(invite) ? invite : null;
  const invitation = token ? await invitationFor(token) : null;
  const role = invitation
    ? { owner: m.team.roleOwner, admin: m.team.roleAdmin, member: m.team.roleMember, filler: m.team.roleFiller }[invitation.role]
    : "";

  // Already signed in: this is someone with an account taking up the invitation.
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  if (user && token) {
    return (
      <AuthFrame tagline={m.brand.tagline}>
        <ClaimInvite
          token={token}
          invitation={invitation ? { email: invitation.email, orgName: invitation.orgName, role } : null}
          you={user.email ?? ""}
        />
      </AuthFrame>
    );
  }

  if (!(await canSignUp())) redirect("/login");
  return (
    <AuthFrame tagline={m.brand.tagline}>
      <SignupForm
        invite={invitation ? token : null}
        invitedEmail={invitation?.email ?? null}
        intro={invitation ? fmt(m.auth.inviteFor, { org: invitation.orgName, role: role.toLowerCase() }) : null}
        linkInvalid={Boolean(token && !invitation)}
      />
    </AuthFrame>
  );
}
