import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Pills that switch a view: the chosen one sits raised on a soft grey track.
 * Links, not buttons, so a choice is a URL like every other filter here.
 */
export function SegmentedLinks({
  items,
  className,
}: {
  items: { href: string; label: React.ReactNode; active: boolean }[];
  className?: string;
}) {
  return (
    <div className={cn("inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-surface p-1", className)}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          scroll={false}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "shrink-0 rounded-full px-3.5 py-1.5 text-[13.5px] font-medium transition-[background-color,color,box-shadow] duration-150",
            item.active
              ? "bg-card text-foreground shadow-[0_1px_3px_rgb(14_14_16/0.1)]"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
