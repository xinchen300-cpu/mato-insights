import { MatoWordmark } from "@/components/brand/mato-mark";
import { LanguageToggle } from "@/components/shell/language-toggle";

// Geen navigatie: wie hier staat heeft één taak, en elke andere knop is een
// uitweg die hij nog niet kan gebruiken.
export default function WelcomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-background">
      <header className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between gap-3 px-5 sm:px-8">
        <MatoWordmark />
        <LanguageToggle />
      </header>
      <main>{children}</main>
    </div>
  );
}
