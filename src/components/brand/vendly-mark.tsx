// A machine silhouette with rising bars: vending + statistics.
export function VendlyMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect x="4" y="2" width="24" height="28" fill="#1c1812" />
      <rect x="9" y="17" width="4" height="8" fill="#a6752c" />
      <rect x="14.5" y="12" width="4" height="13" fill="#a6752c" />
      <rect x="20" y="7" width="4" height="18" fill="#ede6d8" />
    </svg>
  );
}

export function VendlyWordmark({ subtitle }: { subtitle?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <VendlyMark className="size-8 shrink-0" />
      <span className="flex flex-col leading-none">
        <span className="whitespace-nowrap font-heading text-[19px] font-bold tracking-[0.06em] text-foreground">
          VENDLY
        </span>
        {subtitle && (
          <span className="mt-1 hidden whitespace-nowrap font-mono text-[8.5px] font-bold uppercase tracking-[0.2em] text-heading lg:block">
            {subtitle}
          </span>
        )}
      </span>
    </span>
  );
}
