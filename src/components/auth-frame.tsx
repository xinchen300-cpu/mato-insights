import { VendlyWordmark } from "@/components/brand/vendly-mark";
import { LanguageToggle } from "@/components/shell/language-toggle";

/**
 * The pieces every sign-in screen shares, so the five of them stay one family:
 * one white card in the middle, a title that carries it, roomy fields, and the
 * way out (or back) underneath the card instead of inside it.
 */
export const authCard = "surface-card px-6 py-7 sm:px-9 sm:py-9";
export const authTitle = "text-[28px] font-semibold leading-tight tracking-[-0.03em]";
export const authHint = "mt-2 text-[15px] leading-relaxed text-muted-foreground";
export const authForm = "mt-7 grid gap-5";
export const authField = "grid gap-2";
export const authInput = "h-12 px-4 text-base md:text-[15px]";
export const authFieldHint = "text-[13px] text-muted-foreground";
export const authError = "text-[13.5px] font-medium text-negative";
export const authAside = "mt-6 px-2 text-center text-sm text-muted-foreground";
export const authLink =
  "font-semibold text-foreground underline decoration-foreground/25 underline-offset-4 transition-colors hover:decoration-foreground";

export function AuthFrame({ tagline, children }: { tagline: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col px-4 sm:px-6">
      <header className="flex justify-end py-4 sm:py-6">
        <LanguageToggle />
      </header>
      <main className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center pb-16 pt-2 sm:pb-24">
        {/* The brand sits above the card, the way an app opens on its own name. */}
        <div className="mb-8 flex flex-col items-center gap-2.5 text-center">
          <VendlyWordmark />
          <p className="text-[13px] font-medium text-muted-foreground">{tagline}</p>
        </div>
        {children}
      </main>
    </div>
  );
}
