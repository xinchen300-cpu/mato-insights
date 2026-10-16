import { cn } from "@/lib/utils";

/**
 * A check that draws itself: a green disc that pops in and a white tick that
 * follows, or just the lines for a small confirmation. Shown once, at the
 * moment something is done; without motion it is simply there.
 */
export function SuccessCheck({
  variant = "filled",
  sparks = false,
  className,
}: {
  variant?: "filled" | "line";
  /** A handful of gold sparks around it, for a record or a new level. */
  sparks?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("relative grid shrink-0 place-items-center", className)} aria-hidden="true">
      {variant === "filled" ? (
        <span className="pop grid size-full place-items-center rounded-full bg-positive text-white">
          <svg viewBox="0 0 52 52" className="check-draw size-[62%]">
            <path d="M14 27.5l8 8L38.5 18" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      ) : (
        <svg viewBox="0 0 52 52" className="check-draw size-full text-positive">
          <circle cx="26" cy="26" r="24" fill="none" stroke="currentColor" strokeWidth="3.4" />
          <path d="M15 27l7.5 7.5L37.5 19" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {sparks && <Sparks />}
    </span>
  );
}

/** Eight small sparks flying out once, gold and green, for a moment worth marking. */
export function Sparks({ radius = 46 }: { radius?: number }) {
  return (
    <span className="sparks" aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        <i key={i} style={{ "--a": `${i * 45 + 22}deg`, "--r": `${radius + (i % 2) * 10}px` } as React.CSSProperties} />
      ))}
    </span>
  );
}

/**
 * A ring that fills from where it was to where it is now: a level, a share of
 * a round. `from` and `value` run from 0 to 1.
 */
export function ProgressRing({
  value,
  from = 0,
  size = 64,
  stroke = 6,
  className,
  children,
}: {
  value: number;
  from?: number;
  size?: number;
  stroke?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <span className={cn("relative inline-grid shrink-0 place-items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--surface)" strokeWidth={stroke} />
        {value > 0 && (
          <circle
            className="ring-fill"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - clamp(value))}
            style={{ "--from-offset": `${circumference * (1 - clamp(from))}` } as React.CSSProperties}
          />
        )}
      </svg>
      <span className="absolute inset-0 grid place-items-center">{children}</span>
    </span>
  );
}
