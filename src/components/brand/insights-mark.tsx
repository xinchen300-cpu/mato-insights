// The MATO Insights logo (Xin, 14-10-2026): "mato insights" in Inter between
// two gold brackets, the same bracket style the Vendly logo had, and [m] as the
// mark. Drawn inline so it stays sharp and needs no extra request; the text is
// pinned to its measured width (textLength, Inter SemiBold 42px with -0.03em
// tracking = 257) so the brackets sit right even before Inter has loaded.

const GOLD = "#A6752C";
const INK = "#2A2520";

/** [m]: the mark on its own, for small places. */
export function InsightsMark({ className }: { className?: string }) {
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
        m
      </text>
    </svg>
  );
}

/** [mato insights]: the logo. The words take the text colour; the brackets stay gold. */
export function InsightsWordmark({ className }: { className?: string }) {
  return (
    <svg viewBox="4 16 317 58" role="img" aria-label="MATO Insights" className={className ?? "h-[30px] w-auto text-[#2a2520]"}>
      <path d="M22,20 L8,20 L8,70 L22,70" fill="none" stroke={GOLD} strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M303,20 L317,20 L317,70 L303,70" fill="none" stroke={GOLD} strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
      <text
        x="34"
        y="61"
        textLength="257"
        lengthAdjust="spacing"
        fill="currentColor"
        style={{ fontFamily: "var(--font-inter), Inter, sans-serif", fontWeight: 600, fontSize: 42, letterSpacing: -1.26 }}
      >
        mato insights
      </text>
    </svg>
  );
}
