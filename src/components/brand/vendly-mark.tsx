// Xin's Vendly logo (11-10-2026): "vendly" in Inter between two gold brackets,
// and [v] as the mark. The source files, ready for print and ads, are in
// public/brand. Drawn inline so it stays sharp and needs no extra request; the
// text is pinned to its measured width (textLength) so the brackets sit right
// even before Inter has loaded.

const GOLD = "#A6752C";
const INK = "#2A2520";

/** [v]: the mark on its own, for small places. */
export function VendlyMark({ className }: { className?: string }) {
  return (
    <svg viewBox="14 15 92 60" className={className} aria-hidden="true">
      <path d="M34,20 L20,20 L20,70 L34,70" fill="none" stroke={GOLD} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M86,20 L100,20 L100,70 L86,70" fill="none" stroke={GOLD} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <text
        x="60"
        y="61"
        textAnchor="middle"
        fill={INK}
        style={{ fontFamily: "var(--font-inter), Inter, sans-serif", fontWeight: 600, fontSize: 44, letterSpacing: -1.3 }}
      >
        v
      </text>
    </svg>
  );
}

/** [vendly]: the logo. The word takes the text colour; the brackets stay gold. */
export function VendlyWordmark({ className }: { className?: string }) {
  return (
    <svg viewBox="4 16 189 58" role="img" aria-label="Vendly" className={className ?? "h-[30px] w-auto text-[#2a2520]"}>
      <path d="M22,20 L8,20 L8,70 L22,70" fill="none" stroke={GOLD} strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M175,20 L189,20 L189,70 L175,70" fill="none" stroke={GOLD} strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
      <text
        x="34"
        y="61"
        textLength="129"
        lengthAdjust="spacing"
        fill="currentColor"
        style={{ fontFamily: "var(--font-inter), Inter, sans-serif", fontWeight: 600, fontSize: 42, letterSpacing: -1.26 }}
      >
        vendly
      </text>
    </svg>
  );
}
