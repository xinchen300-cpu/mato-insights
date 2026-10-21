import Link from "next/link";
import { LogOut, Settings } from "lucide-react";
import { VendlyWordmark } from "@/components/brand/vendly-mark";
import { FillerAvatar } from "@/components/filler/avatar";
import { cleanLook } from "@/lib/avatar";
import { displayName } from "@/lib/people";
import { getI18n } from "@/i18n/server";
import { isFiller } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { fillerLocales } from "@/i18n/config";
import { HideNumbers } from "./hide-numbers";
import { LanguageToggle } from "./language-toggle";
import { ThemeToggle } from "./theme-toggle";
import { MobileNav, SidebarNav } from "./nav";
import { SignOutForm } from "./sign-out";

const railRow =
  "flex h-10 w-full items-center gap-3 rounded-xl px-3 text-[14.5px] font-medium text-muted-foreground transition-colors duration-150 hover:bg-surface/70 hover:text-foreground";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const { m } = await getI18n();
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  // A filler sees the machines and the refill work only: no overview, no settings, no figures to hide.
  const filler = await isFiller();
  const home = filler ? "/refill" : "/";
  // Profiel (21-10-2026): one's own avatar, or the first letter of one's name, opens it.
  const look = user ? cleanLook(user.user_metadata?.avatar) : null;
  const face = (size: string) => (
    <span className={`grid ${size} shrink-0 place-items-center overflow-hidden rounded-full bg-primary/12 text-[11px] font-bold uppercase text-foreground`}>
      {look ? <FillerAvatar look={look} className="size-full" /> : (displayName(user) || user?.email || "?").charAt(0)}
    </span>
  );

  return (
    <div className="min-h-svh lg:pl-64">
      {/* Large screens: one calm rail. The pages up top, the rest at the bottom. */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r bg-card/50 px-4 pb-5 pt-6 lg:flex">
        <Link href={home} aria-label={filler ? m.nav.home : m.nav.overview} className="px-3">
          <VendlyWordmark name={m.brand.name} />
        </Link>
        <div className="mt-9">
          <SidebarNav filler={filler} />
        </div>
        <div className="mt-auto flex flex-col gap-1">
          {/* Light or dark, for everyone (Xin, 21-10-2026). */}
          <ThemeToggle variant="row" />
          {/* A filler picks Dutch or French here; the owner does so in the settings. */}
          {filler && (
            <div className="px-3 pb-2">
              <LanguageToggle only={fillerLocales} />
            </div>
          )}
          {!filler && (
            <>
              <HideNumbers variant="row" />
              <Link href="/settings" className={railRow}>
                <Settings className="size-[18px] shrink-0" strokeWidth={1.9} aria-hidden="true" />
                {m.nav.settings}
              </Link>
            </>
          )}
          {user && (
            <Link href="/profile" className={railRow}>
              {face("size-[22px] -ml-0.5")}
              <span className="truncate">{m.nav.profile}</span>
            </Link>
          )}
          {user && (
            <SignOutForm question={m.auth.confirmSignOut}>
              <button type="submit" title={user.email ?? m.auth.signOut} className={railRow}>
                <LogOut className="size-[18px] shrink-0" strokeWidth={1.9} aria-hidden="true" />
                <span className="truncate">{m.auth.signOut}</span>
              </button>
            </SignOutForm>
          )}
        </div>
      </aside>

      {/* Phones and tablets: the brand and three quiet icons, tabs at the bottom. */}
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4 sm:px-6">
          <Link href={home} aria-label={filler ? m.nav.home : m.nav.overview}>
            <VendlyWordmark name={m.brand.name} />
          </Link>
          <div className="ml-auto flex items-center gap-1">
            {filler && <LanguageToggle only={fillerLocales} />}
            <ThemeToggle />
            {!filler && (
              <>
                <HideNumbers />
                <Link
                  href="/settings"
                  aria-label={m.nav.settings}
                  className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
                >
                  <Settings className="size-[18px]" />
                </Link>
              </>
            )}
            {user && (
              <Link
                href="/profile"
                aria-label={m.nav.profile}
                className="grid size-9 place-items-center rounded-full transition-colors hover:bg-surface"
              >
                {face("size-7")}
              </Link>
            )}
            {user && (
              <SignOutForm question={m.auth.confirmSignOut}>
                <button
                  type="submit"
                  aria-label={m.auth.signOut}
                  title={user.email ?? m.auth.signOut}
                  className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
                >
                  <LogOut className="size-[18px]" />
                </button>
              </SignOutForm>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8 lg:px-10 lg:pb-16 lg:pt-10">
        {children}
      </main>
      <MobileNav filler={filler} />
    </div>
  );
}
