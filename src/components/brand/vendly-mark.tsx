/**
 * The mark: a machine's face in ink, with three columns rising inside it — and
 * the tallest breaking out through the top. That is the whole product in one
 * shape: what the machines sell, and the one number that goes past what you
 * can see from the front. Gold is the site's gold, used generously.
 */
export function VendlyMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="vendly-gold" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#a97a1f" />
          <stop offset="1" stopColor="#c99a3d" />
        </linearGradient>
      </defs>
      {/* the cabinet */}
      <path d="M4 6h24v24H4z" fill="#1c1812" />
      {/* two columns inside it */}
      <path d="M8.5 18h4v8h-4zM14 13h4v13h-4z" fill="url(#vendly-gold)" />
      {/* the third rises past the top edge */}
      <path d="M19.5 2h4v24h-4z" fill="#c99a3d" />
    </svg>
  );
}

/**
 * The Vendly logo: the mark, and VENDLY beside it in the logo's own face
 * (Montserrat, bold, set wide). One SVG, so the two never drift apart, it stays
 * sharp at any size, and the word follows the text colour.
 */
export function VendlyWordmark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1480 260"
      role="img"
      aria-label="Vendly"
      className={className ?? "h-[28px] w-auto text-foreground"}
    >
      <defs>
        <linearGradient id="vendly-wordmark-gold" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#a97a1f" />
          <stop offset="1" stopColor="#c99a3d" />
        </linearGradient>
      </defs>
      <g transform="scale(8.125)">
        <path d="M4 6h24v24H4z" fill="currentColor" />
        <path d="M8.5 18h4v8h-4zM14 13h4v13h-4z" fill="url(#vendly-wordmark-gold)" />
        <path d="M19.5 2h4v24h-4z" fill="#c99a3d" />
      </g>
      <text
        x="320"
        y="244"
        textLength="1160"
        lengthAdjust="spacing"
        fill="currentColor"
        style={{ fontFamily: "var(--font-montserrat), Montserrat, sans-serif", fontWeight: 700, fontSize: 252 }}
      >
        VENDLY
      </text>
    </svg>
  );
}
