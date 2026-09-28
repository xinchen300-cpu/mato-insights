import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth-frame";
import { getI18n } from "@/i18n/server";
import { canSignUp } from "@/lib/signup";
import { SignupForm } from "./signup-form";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.auth.createAccount };
}

export default async function SignupPage() {
  if (!(await canSignUp())) redirect("/login");
  const { m } = await getI18n();
  return (
    <AuthFrame tagline={m.brand.tagline}>
      <SignupForm />
    </AuthFrame>
  );
}
