import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { changeRatio, type Formatters } from "@/i18n/format";
import type { Verdict } from "@/lib/stats";

// Changes within ±2% read as "about the same" instead of a noisy arrow.
const FLAT = 0.02;

/**
 * A percentage change. With a verdict, only a real change gets colour and an
 * arrow; normal swing says so in grey words ("about the same", explained in
 * the tooltip) without a number that would read as a change; too few sales
 * shows nothing. Something that only started selling during the earlier
 * period gets no percentage at all, only its grey "new since" label.
 */
export function Delta({
  current,
  previous,
  f,
  verdict,
  noiseLabel,
  sameLabel,
  newLabel,
  className,
}: {
  current: number;
  previous: number;
  f: Formatters;
  verdict?: Verdict;
  /** Tooltip for a change that is within normal swing. */
  noiseLabel?: string;
  /** The words shown for normal swing ("about the same"). */
  sameLabel?: string;
  /** Shown instead of a percentage when the verdict is "new". */
  newLabel?: string;
  className?: string;
}) {
  if (verdict === "new") {
    return newLabel ? (
      <span className={cn("text-sm font-medium text-muted-foreground", className)}>{newLabel}</span>
    ) : null;
  }
  const ratio = changeRatio(current, previous);
  if (ratio === null || verdict === "tooFew") return null;

  if (verdict === "noise") {
    return sameLabel ? (
      <span title={noiseLabel} className={cn("text-sm font-medium text-muted-foreground", className)}>
        {sameLabel}
      </span>
    ) : null;
  }

  const flat = Math.abs(ratio) < FLAT;
  const Icon = flat ? Minus : ratio > 0 ? ArrowUp : ArrowDown;

  return (
    <span
      className={cn(
        "tabular inline-flex items-center gap-0.5 text-sm font-semibold",
        flat ? "text-muted-foreground" : ratio > 0 ? "text-positive" : "text-negative",
        className,
      )}
    >
      <Icon className="size-3.5" strokeWidth={2.5} />
      {f.percent(flat ? 0 : Math.abs(ratio))}
    </span>
  );
}
