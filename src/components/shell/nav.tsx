"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartColumn,
  ClipboardList,
  LayoutDashboard,
  Package,
  type LucideIcon,
} from "lucide-react";
import { MachineIcon } from "@/components/machine/machine-icon";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/client";
import type { Messages } from "@/i18n/messages";

const items: { href: string; label: keyof Messages["nav"]; icon: LucideIcon | typeof MachineIcon }[] = [
  { href: "/", label: "overview", icon: LayoutDashboard },
  { href: "/machines", label: "machines", icon: MachineIcon },
  { href: "/products", label: "products", icon: Package },
  { href: "/refill", label: "refill", icon: ClipboardList },
  { href: "/statistics", label: "statistics", icon: ChartColumn },
];

/** What a filler may open: the refill work and nothing else. */
const fillerItems = items.filter((item) => item.href === "/refill");

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** The left rail on large screens: icon and word, the current page on a soft grey. */
export function SidebarNav({ filler = false }: { filler?: boolean }) {
  const pathname = usePathname();
  const { m } = useI18n();

  return (
    <nav className="flex flex-col gap-1">
      {(filler ? fillerItems : items).map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-10 items-center gap-3 rounded-xl px-3 text-[14.5px] transition-colors duration-150",
              active
                ? "bg-surface font-semibold text-foreground"
                : "font-medium text-muted-foreground hover:bg-surface/70 hover:text-foreground",
            )}
          >
            <Icon className="size-[18px] shrink-0" strokeWidth={active ? 2.25 : 1.9} aria-hidden="true" />
            {m.nav[label]}
          </Link>
        );
      })}
    </nav>
  );
}

/** Phones and tablets: a tab bar at the thumb, like a native app. */
export function MobileNav({ filler = false }: { filler?: boolean }) {
  const pathname = usePathname();
  const { m } = useI18n();
  // One destination needs no tab bar.
  if (filler) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
      <div className="mx-auto grid max-w-xl grid-cols-5 px-2">
        {items.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 py-2 text-[10.5px] transition-colors",
                active ? "font-semibold text-foreground" : "font-medium text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "grid h-7 w-12 place-items-center rounded-full transition-colors duration-150",
                  active && "bg-surface",
                )}
              >
                <Icon className="size-5" strokeWidth={active ? 2.25 : 1.9} aria-hidden="true" />
              </span>
              {m.nav[label]}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
