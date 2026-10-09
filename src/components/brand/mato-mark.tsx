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

/**
 * The MATO logo as on matoautomaat.be — MATO, and under it one quiet word set
 * wide — with INSIGHTS where the site says AUTOMATEN. Drawn as text in the
 * logo's own face, so it stays sharp at any size and follows the text colour.
 */
export function MatoWordmark({ className }: { subtitle?: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 933 282"
      role="img"
      aria-label="MATO Insights"
      className={className ?? "h-[34px] w-auto text-foreground"}
    >
      <text
        x="466.5"
        y="186"
        textAnchor="middle"
        textLength="933"
        lengthAdjust="spacing"
        fill="currentColor"
        style={{ fontFamily: "var(--font-montserrat), Montserrat, sans-serif", fontWeight: 700, fontSize: 262 }}
      >
        MATO
      </text>
      <text
        x="466.5"
        y="280"
        textAnchor="middle"
        textLength="620"
        lengthAdjust="spacing"
        fill="currentColor"
        style={{ fontFamily: "var(--font-montserrat), Montserrat, sans-serif", fontWeight: 400, fontSize: 58 }}
      >
        INSIGHTS
      </text>
    </svg>
  );
}
