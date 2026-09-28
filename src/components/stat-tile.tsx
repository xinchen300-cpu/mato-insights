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
}: {
  label: string;
  value: string;
  current?: number;
  previous?: number;
  compareLabel?: string;
  detail?: string;
  /** Whether the change is real, judged on the number of sales. */
  verdict?: Verdict;
  verdictNotes?: { tooFew: string; noise: string };
  f: Formatters;
}) {
  const canCompare = current !== undefined && previous !== undefined && previous > 0;
  const tooFew = canCompare && verdict === "tooFew";

  return (
    <div className="border bg-card p-5 shadow-[0_8px_22px_rgb(28_24_18/0.06)]">
      <p className="eyebrow">{label}</p>
      <p className="tabular mt-3 font-heading text-[1.5rem] font-semibold leading-none tracking-tight text-foreground sm:text-[1.6rem] md:text-[1.75rem] lg:text-[2rem]">
        {value}
      </p>
      <div className="mt-3 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
        {canCompare && !tooFew && (
          <Delta current={current} previous={previous} f={f} verdict={verdict} noiseLabel={verdictNotes?.noise} />
        )}
        {canCompare && !tooFew && compareLabel && <span>{compareLabel}</span>}
        {tooFew && verdictNotes && <span>{verdictNotes.tooFew}</span>}
        {detail && <span className="tabular">{detail}</span>}
      </div>
      {canCompare && verdict === "noise" && verdictNotes && (
        <p className="mt-1.5 text-xs text-muted-foreground">{verdictNotes.noise}</p>
      )}
    </div>
  );
}
