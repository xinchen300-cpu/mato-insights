import { Suspense } from "react";
import { AuthFrame } from "@/components/auth-frame";
import { getI18n } from "@/i18n/server";
import { canSignUp } from "@/lib/signup";
import { LoginForm } from "./login-form";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.auth.signIn };
}

export default async function LoginPage() {
  const { m } = await getI18n();
  return (
    <AuthFrame tagline={m.brand.tagline}>
      <Suspense>
        <LoginForm canSignUp={await canSignUp()} />
      </Suspense>
    </AuthFrame>
  );
}
