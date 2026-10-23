// The logo: "mato info" in Inter between two gold brackets, and [m] as the
// mark (Xin, 19-10-2026: the name is MATO Info; before, [vendly] and [v]).
// Drawn inline so it stays sharp and needs no extra request; the text is pinned
// to its measured width (textLength) so the brackets sit right even before
// Inter has loaded. The file and component names stay as they were.

const GOLD = "#A6752C";
const INK = "#2A2520";

// How wide each letter is in the logo's Inter at 42px with its letter spacing, measured in the browser
// (21-10-2026): an own name gets its closing bracket as close as "mato info" does ("mato" is 97 wide).
const ADVANCE: Record<string, number> = {
  a: 22.9, b: 25, c: 23.2, d: 25, e: 23.6, f: 15.1, g: 25, h: 24.5, i: 9.7, j: 9.7, k: 22.7, l: 9.7, m: 36.6,
  n: 24.4, o: 24.3, p: 25, q: 25, r: 15.4, s: 21.8, t: 13.6, u: 24.5, v: 23.4, w: 34, x: 22.6, y: 23.5, z: 22.5,
  "0": 26.5, "1": 16.5, "2": 24.9, "3": 25.5, "4": 26.7, "5": 24.5, "6": 25.6, "7": 23, "8": 25.6, "9": 25.6,
  " ": 8.4, "&": 26.6, "-": 18.3, ".": 12.1,
};

function textWidth(label: string): number {
  const plain = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return Math.round([...plain].reduce((sum, c) => sum + (ADVANCE[c] ?? 24), 0));
}

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
  const width = label === "mato info" ? 179 : textWidth(label);
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
