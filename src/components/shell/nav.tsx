"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartColumn,
  ClipboardList,
  House,
  LayoutDashboard,
  ListChecks,
  type LucideIcon,
} from "lucide-react";
import { MachineIcon } from "@/components/machine/machine-icon";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/client";
import type { Messages } from "@/i18n/messages";

type NavItem = {
  href: string;
  label: keyof Messages["nav"];
  icon: LucideIcon | typeof MachineIcon;
  /** Another place that belongs to this item. */
  also?: string;
};

/** Producten left (Xin, 20-10-2026): a slot's product is set in the layout; the page opens from Automaten. */
const items: NavItem[] = [
  { href: "/", label: "overview", icon: LayoutDashboard },
  { href: "/machines", label: "machines", icon: MachineIcon, also: "/products" },
  { href: "/refill", label: "refill", icon: ClipboardList },
  { href: "/statistics", label: "statistics", icon: ChartColumn },
];

/**
 * What a filler may open: home (their start screen, the refill work), the
 * machines, the vullijst (what each machine needs, box by box) and what sells,
 * in pieces. Their machines open in the refill pages, so those count as the
 * machines tab. Home was "Bijvullen" until Xin asked for a home button (19-10-2026).
 */
const fillerItems: NavItem[] = [
  { href: "/refill", label: "home", icon: House },
  { href: "/machines", label: "machines", icon: MachineIcon, also: "/refill/machines" },
  { href: "/refill/list", label: "fillList", icon: ListChecks },
  { href: "/statistics", label: "sales", icon: ChartColumn },
];

function matchLength(pathname: string, path: string) {
  if (path === "/") return pathname === "/" ? 1 : -1;
  return pathname === path || pathname.startsWith(`${path}/`) ? path.length : -1;
}

/** The one item to light up: the longest match, so a machine under /refill/machines is not also the refill tab. */
function activeHref(pathname: string, list: NavItem[]) {
  let best: { href: string; length: number } | null = null;
  for (const item of list) {
    const length = Math.max(matchLength(pathname, item.href), item.also ? matchLength(pathname, item.also) : -1);
    if (length >= 0 && (!best || length > best.length)) best = { href: item.href, length };
  }
  return best?.href ?? null;
}

/** The left rail on large screens: icon and word, the current page on a soft grey. */
export function SidebarNav({ filler = false }: { filler?: boolean }) {
  const pathname = usePathname();
  const { m } = useI18n();
  const list = filler ? fillerItems : items;
  const current = activeHref(pathname, list);

  return (
    <nav className="flex flex-col gap-1">
      {list.map(({ href, label, icon: Icon }) => {
        const active = href === current;
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
  const list = filler ? fillerItems : items;
  const current = activeHref(pathname, list);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
      <div className="mx-auto grid max-w-xl grid-cols-4 px-2">
        {list.map(({ href, label, icon: Icon }) => {
          const active = href === current;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                // Four tabs for a filler still leave room for a label that reads outdoors.
                "flex flex-col items-center gap-1 py-2 transition-[color,transform] active:scale-95",
                filler ? "text-[12px]" : "text-[10.5px]",
                active ? "font-semibold text-foreground" : "font-medium text-muted-foreground",
              )}
            >
              <TabIcon icon={Icon} active={active} />
              {m.nav[label]}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * The tab lights up on the tap itself, not when the next page is in (22-10-2026, Xin: "slow and not responsive"): on
 * a phone with a weak signal that can take a second, and a tab that did nothing looked like a missed tap.
 */
function TabIcon({ icon: Icon, active }: { icon: NavItem["icon"]; active: boolean }) {
  const { pending } = useLinkStatus();
  const lit = active || pending;
  return (
    <span className={cn("grid h-7 w-12 place-items-center rounded-full transition-colors duration-150", lit && "bg-surface")}>
      <Icon className="size-5" strokeWidth={lit ? 2.25 : 1.9} aria-hidden="true" />
    </span>
  );
}
