import { Sparkles } from "lucide-react";
import type { Messages } from "@/i18n/messages";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Tips turn over once a week, the same for everyone that week, so a tip
// stays long enough to act on.
export function TipsPanel({ m, count, title }: { m: Messages; count: number; title: string }) {
  const items = m.tips.items;
  const week = Math.floor(Date.now() / WEEK_MS);
  const picked = Array.from({ length: Math.min(count, items.length) }, (_, i) => items[(week * count + i) % items.length]);
  const categories = m.tips.categories as Record<string, string>;

  return (
    <section className="border bg-card p-5 sm:p-6">
      <p className="eyebrow mb-3 flex items-center gap-2">
        <Sparkles className="size-3.5" />
        {title}
      </p>
      <ul className={`grid gap-5 ${picked.length > 1 ? "sm:grid-cols-3" : ""}`}>
        {picked.map((tip) => (
          <li key={tip.title}>
            <p className="text-xs font-semibold uppercase tracking-wide text-accent-foreground">
              {categories[tip.category] ?? tip.category}
            </p>
            <h3 className="mt-1 text-base">{tip.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{tip.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
