import { Hourglass, Lightbulb, TrendingUp, TriangleAlert } from "lucide-react";
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
    case "tooEarly":
      return fmt(m.insights.tooEarly, { days: insight.days });
    case "bestDay":
      return fmt(m.insights.bestDay, { day: m.weekdays[insight.weekday - 1], pct: insight.pct, weeks: insight.weeks });
    case "sharedLead":
      return fmt(m.insights.sharedLead, { first: insight.first, second: insight.second });
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

export function InsightsList({ insights, m, f }: { insights: Insight[]; m: Messages; f: Formatters }) {
  if (insights.length === 0) return null;

  return (
    <section aria-label={m.insights.title}>
      <ul className="flex flex-col gap-2">
        {insights.map((insight, i) => {
          const Icon =
            insight.kind === "quietMachine"
              ? TriangleAlert
              : insight.kind === "tooEarly"
                ? Hourglass
                : insight.kind === "bestSeller"
                  ? TrendingUp
                  : Lightbulb;
          return (
            <li key={i} className="figure flex gap-2.5 text-sm leading-snug text-muted-foreground">
              <Icon
                aria-hidden="true"
                className={`mt-px size-4 shrink-0 ${insight.kind === "quietMachine" ? "text-negative" : "text-muted-foreground"}`}
              />
              <span>{sentence(insight, m, f)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
