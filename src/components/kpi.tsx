import { Delta } from "@/components/delta";
import type { Formatters } from "@/i18n/format";
import type { Verdict } from "@/lib/stats";
import { cn } from "@/lib/utils";

type Compare = {
  current: number;
  previous: number;
  label?: string;
  verdict?: Verdict;
  notes?: { tooFew: string; noise: string };
};

/**
 * The change line under a figure. A real change gets an arrow and a colour;
 * normal swing stays grey with "~" (its explanation is the tooltip); with too
 * few sales there is no comparison at all, only a note. Same rules as Delta.
 */
function ChangeLine({ compare, detail, f }: { compare?: Compare; detail?: string; f: Formatters }) {
  const canCompare = compare !== undefined && compare.previous > 0;
  const tooFew = canCompare && compare.verdict === "tooFew";
  return (
    <div className="flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] text-muted-foreground">
      {canCompare && !tooFew && (
        <Delta
          current={compare.current}
          previous={compare.previous}
          f={f}
          verdict={compare.verdict}
          noiseLabel={compare.notes?.noise}
        />
      )}
      {canCompare && !tooFew && compare.label && <span>{compare.label}</span>}
      {tooFew && compare.notes && <span>{compare.notes.tooFew}</span>}
      {detail && <span className="tabular">{detail}</span>}
    </div>
  );
}

/** The one figure a page is about: big, black, with its change underneath. */
export function KpiHero({
  label,
  value,
  compare,
  detail,
  f,
  className,
}: {
  label: string;
  value: string;
  compare?: Compare;
  detail?: string;
  f: Formatters;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <p className="text-[14px] font-medium text-muted-foreground">{label}</p>
      <p className="tabular text-[40px] font-semibold leading-none tracking-[-0.04em] sm:text-[48px]">{value}</p>
      <ChangeLine compare={compare} detail={detail} f={f} />
    </div>
  );
}

/** A supporting figure: smaller, on a row with its siblings. */
export function MiniStat({
  label,
  value,
  compare,
  detail,
  f,
  className,
}: {
  label: string;
  value: string;
  compare?: Compare;
  detail?: string;
  f: Formatters;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <p className="truncate text-[13px] font-medium text-muted-foreground">{label}</p>
      <p className="tabular truncate text-[20px] font-semibold leading-none tracking-[-0.03em] sm:text-[22px]">{value}</p>
      {(compare || detail) && <ChangeLine compare={compare} detail={detail} f={f} />}
    </div>
  );
}
