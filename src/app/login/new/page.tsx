import { AuthFrame } from "@/components/auth-frame";
import { getI18n } from "@/i18n/server";
import { NewPasswordForm } from "./new-password-form";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.auth.resetChoose };
}

// Where the mailed link lands, with a session Supabase already exchanged.
export default async function NewPasswordPage() {
  const { m } = await getI18n();
  return (
    <AuthFrame tagline={m.brand.tagline}>
      <NewPasswordForm />
    </AuthFrame>
  );
}
