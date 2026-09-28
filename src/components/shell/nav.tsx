"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartColumn,
  ClipboardList,
  LayoutDashboard,
  Package,
  Refrigerator,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/client";
import type { Messages } from "@/i18n/messages";

const items: { href: string; label: keyof Messages["nav"]; icon: LucideIcon }[] = [
  { href: "/", label: "overview", icon: LayoutDashboard },
  { href: "/machines", label: "machines", icon: Refrigerator },
  { href: "/products", label: "products", icon: Package },
  { href: "/refill", label: "refill", icon: ClipboardList },
  { href: "/statistics", label: "statistics", icon: ChartColumn },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function DesktopNav() {
  const pathname = usePathname();
  const { m } = useI18n();

  return (
    <nav className="hidden items-center gap-1 md:flex">
      {items.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "rounded-full px-3.5 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground",
            isActive(pathname, href) && "bg-card text-foreground shadow-sm",
          )}
        >
          {m.nav[label]}
        </Link>
      ))}
    </nav>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  const { m } = useI18n();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="grid grid-cols-5">
        {items.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center gap-1 py-2.5 text-[10.5px] font-semibold text-muted-foreground",
                active && "text-accent-foreground",
              )}
            >
              <Icon className={cn("size-5", active && "text-primary")} />
              {m.nav[label]}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
