import { CalendarDays, Lightbulb, TrendingUp, TriangleAlert } from "lucide-react";
import { Section } from "@/components/page-header";
import { fmt, type Formatters } from "@/i18n/format";
import type { Messages } from "@/i18n/messages";
import type { Insight } from "@/lib/insights";

// Dutch and French weekday names are lowercase, but can open a sentence.
function sentence(insight: Insight, m: Messages, f: Formatters): string {
  const text = rawSentence(insight, m, f);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function rawSentence(insight: Insight, m: Messages, f: Formatters): string {
  switch (insight.kind) {
    case "bestDay":
      return fmt(m.insights.bestDay, { day: m.weekdays[insight.weekday - 1], pct: insight.pct, weeks: insight.weeks });
    case "quietMachine":
      return fmt(m.insights.quietMachine, { machine: insight.machine, days: insight.days });
    case "topShare":
      return fmt(m.insights.topShare, { machine: insight.machine, pct: insight.pct });
    case "bestSeller":
      return insight.change === null
        ? fmt(m.insights.bestSellerNoCompare, { product: insight.product })
        : fmt(m.insights.bestSeller, { product: insight.product, change: f.change(insight.change) });
  }
}

const icons = {
  bestDay: CalendarDays,
  quietMachine: TriangleAlert,
  topShare: Lightbulb,
  bestSeller: TrendingUp,
} as const;

/** "Good to know": a few plain sentences at the foot of the overview, each one worth reading. */
export function InsightsList({ insights, m, f }: { insights: Insight[]; m: Messages; f: Formatters }) {
  if (insights.length === 0) return null;

  return (
    <Section title={m.insights.title}>
      <ul className="surface-card flex flex-col gap-4 p-5 sm:p-6">
        {insights.map((insight, i) => {
          const Icon = icons[insight.kind];
          return (
            <li key={i} className="figure flex gap-3 text-[15px] leading-snug">
              <Icon aria-hidden="true" className="mt-0.5 size-[18px] shrink-0 text-muted-foreground" />
              <span>{sentence(insight, m, f)}</span>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
