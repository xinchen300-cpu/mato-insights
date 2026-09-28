export type FillLevel = "full" | "half" | "low" | "empty" | "unknown";

// Green / orange / red / empty, as the spec asks.
export function fillLevel(stock: number | null, capacity: number): FillLevel {
  if (stock === null) return "unknown";
  if (stock <= 0) return "empty";
  const ratio = stock / Math.max(capacity, 1);
  if (ratio >= 0.75) return "full";
  if (ratio >= 0.3) return "half";
  return "low";
}

export function needsAttention(level: FillLevel) {
  return level === "low" || level === "empty";
}

export const levelColor: Record<FillLevel, string> = {
  full: "bg-level-full",
  half: "bg-level-half",
  low: "bg-level-low",
  empty: "bg-level-empty",
  unknown: "bg-level-empty",
};
