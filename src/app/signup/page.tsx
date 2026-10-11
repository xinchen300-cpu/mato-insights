import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth-frame";
import { getI18n } from "@/i18n/server";
import { canSignUp } from "@/lib/signup";
import { SignupForm } from "./signup-form";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.auth.createAccount };
}

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  if (!(await canSignUp())) redirect("/login");
  const { m } = await getI18n();
  // The invitation link's token: what attaches the new account to its organisation.
  const { invite } = await searchParams;
  const token = invite && /^[A-Za-z0-9_-]{16,64}$/.test(invite) ? invite : null;
  return (
    <AuthFrame tagline={m.brand.tagline}>
      <SignupForm invite={token} />
    </AuthFrame>
  );
}
