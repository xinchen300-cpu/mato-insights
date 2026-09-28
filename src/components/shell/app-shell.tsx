import Link from "next/link";
import { LogOut, Settings } from "lucide-react";
import { VendlyWordmark } from "@/components/brand/vendly-mark";
import { getI18n } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { HideNumbers } from "./hide-numbers";
import { LanguageToggle } from "./language-toggle";
import { DesktopNav, MobileNav } from "./nav";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const { m } = await getI18n();
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" aria-label={m.nav.overview}>
            <VendlyWordmark subtitle={m.brand.subtitle} />
          </Link>
          <DesktopNav />
          <div className="ml-auto flex items-center gap-2">
            <LanguageToggle />
            <HideNumbers />
            <Link
              href="/settings"
              aria-label={m.nav.settings}
              className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
            >
              <Settings className="size-[18px]" />
            </Link>
            {user && (
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  aria-label={m.auth.signOut}
                  title={user.email ?? m.auth.signOut}
                  className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
                >
                  <LogOut className="size-[18px]" />
                </button>
              </form>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-8 sm:px-6 md:pb-16">
        {children}
      </main>
      <MobileNav />
    </div>
  );
}
