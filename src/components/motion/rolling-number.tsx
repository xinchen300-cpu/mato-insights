import { cn } from "@/lib/utils";

const DIGITS = "0123456789".split("");

/**
 * A figure whose digits roll up into place as it appears, the way a banking
 * app shows a balance. Everything that is not a digit (€, separators, "min")
 * stays put, so any formatted figure works. It is pure CSS: it runs from the
 * first paint, and without motion the figure simply stands there. Screen
 * readers get the plain figure; the moving copy is hidden from them.
 */
export function RollingNumber({ value, className }: { value: string; className?: string }) {
  let digit = 0;
  return (
    <span className={cn("rolling", className)}>
      <span className="sr-only">{value}</span>
      <span aria-hidden="true" className="contents select-none">
        {Array.from(value).map((char, index) =>
          /\d/.test(char) ? (
            <span key={index} className="rolling-col" style={{ "--d": Number(char), "--i": digit++ } as React.CSSProperties}>
              <span>
                {DIGITS.map((n) => (
                  <span key={n}>{n}</span>
                ))}
              </span>
            </span>
          ) : (
            <span key={index} className="rolling-char">
              {char}
            </span>
          ),
        )}
      </span>
    </span>
  );
}
