import { VendlyWordmark } from "@/components/brand/vendly-mark";
import { LanguageToggle } from "@/components/shell/language-toggle";

export function AuthFrame({ tagline, children }: { tagline: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col px-4">
      <header className="mx-auto flex w-full max-w-md items-center justify-between py-5">
        <VendlyWordmark />
        <LanguageToggle />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center pb-16">
        <p className="eyebrow mb-3">{tagline}</p>
        {children}
      </main>
    </div>
  );
}
