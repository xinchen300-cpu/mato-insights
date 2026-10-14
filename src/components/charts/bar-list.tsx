import { cn } from "@/lib/utils";

// A plain horizontal bar list: readable on a phone and needs no chart library.
// Only the bar the caller names is coloured, so a bar that is merely the
// longest never passes for a real difference: that verdict comes from lib/stats.
export function BarList({
  items,
  highlightKey = null,
}: {
  items: { key: string; label: string; value: number; display: string }[];
  highlightKey?: string | null;
}) {
  const max = Math.max(...items.map((i) => i.value), 0);

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.key} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate text-muted-foreground">{item.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-surface">
            <span
              className={cn(
                "block h-full rounded-full transition-[width] duration-500",
                item.key === highlightKey && max > 0 ? "bg-primary" : "bg-chart-5",
              )}
              style={{ width: max > 0 ? `${(item.value / max) * 100}%` : "0%" }}
            />
          </span>
          <span className="tabular w-20 text-right font-medium">{item.display}</span>
        </li>
      ))}
    </ul>
  );
}
