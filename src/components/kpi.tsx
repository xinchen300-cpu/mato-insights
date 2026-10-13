import { Delta } from "@/components/delta";
import type { Formatters } from "@/i18n/format";
import type { Verdict } from "@/lib/stats";
import { cn } from "@/lib/utils";

type Compare = {
  current: number;
  previous: number;
  label?: string;
  verdict?: Verdict;
  /** `new`: "New since 9 Sep", for a selection that started after the earlier period began. */
  notes?: { tooFew: string; noise: string; same?: string; new?: string };
};

/**
 * The change line under a figure. A real change gets an arrow and a colour;
 * normal swing says "about the same" in grey (explained in the tooltip); with too
 * few sales there is no comparison at all, only a note, and the same for a
 * selection that had not started yet. Same rules as Delta.
 */
function ChangeLine({ compare, detail, f }: { compare?: Compare; detail?: string; f: Formatters }) {
  const isNew = compare?.verdict === "new";
  const canCompare = compare !== undefined && compare.previous > 0 && !isNew;
  const tooFew = canCompare && compare.verdict === "tooFew";
  return (
    <div className="flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] text-muted-foreground">
      {isNew && compare.notes?.new && <span>{compare.notes.new}</span>}
      {canCompare && !tooFew && (
        <Delta
          current={compare.current}
          previous={compare.previous}
          f={f}
          verdict={compare.verdict}
          noiseLabel={compare.notes?.noise}
          sameLabel={compare.notes?.same}
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
  leading,
}: {
  label: string;
  value: string;
  /** A small mark before the value, such as a status dot. */
  leading?: React.ReactNode;
  compare?: Compare;
  detail?: string;
  f: Formatters;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <p className="truncate text-[13px] font-medium text-muted-foreground">{label}</p>
      <p className="flex items-center gap-2">
        {leading}
        <span className="tabular truncate text-[20px] font-semibold leading-none tracking-[-0.03em] sm:text-[22px]">
          {value}
        </span>
      </p>
      {(compare || detail) && <ChangeLine compare={compare} detail={detail} f={f} />}
    </div>
  );
}
