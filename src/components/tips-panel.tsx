import { Sparkles } from "lucide-react";
import { Avatar } from "@/components/list-row";
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
    <section className="surface-card p-5 sm:p-6">
      <div className="mb-5 flex items-center gap-3">
        <Avatar tone="gold" className="size-9 [&_svg]:size-4">
          <Sparkles />
        </Avatar>
        <p className="text-[18px] font-semibold tracking-[-0.02em] text-heading">{title}</p>
      </div>
      <ul className={`grid gap-6 ${picked.length > 1 ? "sm:grid-cols-3 sm:gap-8" : ""}`}>
        {picked.map((tip) => (
          <li key={tip.title}>
            <p className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
              <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
              {categories[tip.category] ?? tip.category}
            </p>
            <h3 className="mt-1.5 text-[15px] font-semibold tracking-[-0.01em]">{tip.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{tip.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
