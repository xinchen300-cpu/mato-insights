import { Delta } from "@/components/delta";
import type { Formatters } from "@/i18n/format";
import type { Verdict } from "@/lib/stats";

export function StatTile({
  label,
  value,
  current,
  previous,
  compareLabel,
  detail,
  verdict,
  verdictNotes,
  f,
  bare,
}: {
  label: string;
  value: string;
  current?: number;
  previous?: number;
  compareLabel?: string;
  detail?: string;
  /** Whether the change is real, judged on the number of sales. */
  verdict?: Verdict;
  verdictNotes?: { tooFew: string; noise: string; same?: string };
  f: Formatters;
  /** Inside a shared band: no border of its own. */
  bare?: boolean;
}) {
  const canCompare = current !== undefined && previous !== undefined && previous > 0;
  const tooFew = canCompare && verdict === "tooFew";

  return (
    <div className={bare ? "px-4 py-4 sm:p-6" : "surface-card p-5 sm:p-6"}>
      <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
      <p className="tabular mt-2.5 text-[26px] font-semibold leading-none tracking-[-0.035em] text-foreground sm:text-[30px]">
        {value}
      </p>
      <div className="mt-3 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] text-muted-foreground">
        {canCompare && !tooFew && (
          <Delta
            current={current}
            previous={previous}
            f={f}
            verdict={verdict}
            noiseLabel={verdictNotes?.noise}
            sameLabel={verdictNotes?.same}
          />
        )}
        {canCompare && !tooFew && compareLabel && <span>{compareLabel}</span>}
        {tooFew && verdictNotes && <span>{verdictNotes.tooFew}</span>}
        {detail && <span className="tabular">{detail}</span>}
      </div>
    </div>
  );
}
