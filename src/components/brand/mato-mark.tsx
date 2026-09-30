/**
 * The mark: a machine's face in ink, with three columns rising inside it — and
 * the tallest breaking out through the top. That is the whole product in one
 * shape: what the machines sell, and the one number that goes past what you
 * can see from the front. Gold is the site's gold, used generously.
 */
export function MatoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="mato-gold" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#a97a1f" />
          <stop offset="1" stopColor="#c99a3d" />
        </linearGradient>
      </defs>
      {/* the cabinet */}
      <path d="M4 6h24v24H4z" fill="#1c1812" />
      {/* two columns inside it */}
      <path d="M8.5 18h4v8h-4zM14 13h4v13h-4z" fill="url(#mato-gold)" />
      {/* the third rises past the top edge */}
      <path d="M19.5 2h4v24h-4z" fill="#c99a3d" />
    </svg>
  );
}

export function MatoWordmark({ subtitle }: { subtitle?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <MatoMark className="size-8 shrink-0" />
      <span className="flex flex-col leading-none">
        <span className="whitespace-nowrap font-heading text-[19px] font-bold tracking-[-0.01em] text-foreground">
          MATO <span className="font-medium text-heading">Insights</span>
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
