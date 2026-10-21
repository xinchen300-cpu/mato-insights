// The logo: "mato info" in Inter between two gold brackets, and [m] as the
// mark (Xin, 19-10-2026: the name is MATO Info; before, [vendly] and [v]).
// Drawn inline so it stays sharp and needs no extra request; the text is pinned
// to its measured width (textLength) so the brackets sit right even before
// Inter has loaded. The file and component names stay as they were.

const GOLD = "#A6752C";
const INK = "#2A2520";

/** [m]: the mark on its own, for small places. */
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
        m
      </text>
    </svg>
  );
}

/**
 * [mato info]: the logo. The words take the text colour; the brackets stay gold. An organisation with a name of
 * its own for the app gets that name between the brackets (the demo account: [mato]), the closing bracket moved up.
 */
export function VendlyWordmark({ className, name = "MATO Info" }: { className?: string; name?: string }) {
  const label = name.toLowerCase();
  // "mato info" is 179 wide: about 19.9 per letter, so the brackets sit as close to a shorter name.
  const width = label === "mato info" ? 179 : Math.round(label.length * 19.9);
  const right = 46 + width;
  return (
    <svg viewBox={`4 16 ${right + 10} 58`} role="img" aria-label={name} className={className ?? "h-[30px] w-auto text-brand-ink"}>
      <path d="M22,20 L8,20 L8,70 L22,70" fill="none" stroke={GOLD} strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d={`M${right},20 L${right + 14},20 L${right + 14},70 L${right},70`} fill="none" stroke={GOLD} strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
      <text
        x="34"
        y="61"
        textLength={width}
        lengthAdjust="spacing"
        fill="currentColor"
        style={{ fontFamily: "var(--font-inter), Inter, sans-serif", fontWeight: 600, fontSize: 42, letterSpacing: -1.26 }}
      >
        {label}
      </text>
    </svg>
  );
}
