import { AuthFrame } from "@/components/auth-frame";
import { getI18n } from "@/i18n/server";
import { ForgotForm } from "./forgot-form";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.auth.resetTitle };
}

// Asking for a new password. Reachable without a session, on purpose: the whole
// point is that you cannot get in.
export default async function ForgotPage() {
  const { m } = await getI18n();
  return (
    <AuthFrame tagline={m.brand.tagline}>
      <ForgotForm />
    </AuthFrame>
  );
}
