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

/**
 * How full a whole machine is, as one percentage with a traffic-light band
 * (Xin, 14-10-2026): red under 30%, orange under 60%, green from 60%. Only
 * counted slots take part; with nothing counted there is no percentage at
 * all, and the screen shows a grey "?" instead of a made-up number.
 */
export type FillBand = "red" | "orange" | "green";

export function machineFill(stock: number, capacity: number, counted: boolean): { percent: number; band: FillBand } | null {
  if (!counted || capacity <= 0) return null;
  const percent = Math.max(0, Math.min(100, Math.round((stock / capacity) * 100)));
  return { percent, band: percent < 30 ? "red" : percent < 60 ? "orange" : "green" };
}

// The strong shades: these carry text (white on the pill, or the % itself), so they keep 4.5:1.
export const bandText: Record<FillBand, string> = {
  red: "text-level-low-ink",
  orange: "text-level-half-ink",
  green: "text-level-full-ink",
};

export const bandBg: Record<FillBand, string> = {
  red: "bg-level-low-strong",
  orange: "bg-level-half-strong",
  green: "bg-level-full-strong",
};

/** Sums slot stock per machine; slots never counted stay out of both sides. */
export function machineTotals(slots: { machine_id: string; stock: number | null; capacity: number }[]) {
  const totals = new Map<string, { stock: number; capacity: number; counted: boolean }>();
  for (const slot of slots) {
    const t = totals.get(slot.machine_id) ?? { stock: 0, capacity: 0, counted: false };
    if (slot.stock !== null) {
      t.stock += slot.stock;
      t.capacity += slot.capacity;
      t.counted = true;
    }
    totals.set(slot.machine_id, t);
  }
  return totals;
}

/**
 * The machines Vendly fills. One filled by hand, outside Vendly (refill_manual,
 * Xin 19-10-2026), keeps its sales, but its stock is never brought up to date,
 * so it stays out of rounds, the vullijst, a filler's tiles and every warning
 * about stock.
 */
export function filledByVendly<M extends { refill_manual: boolean }>(machines: M[]): M[] {
  return machines.filter((machine) => !machine.refill_manual);
}

/** The slots of the machines Vendly fills, by the same rule. */
export function slotsFilledByVendly<S extends { machine_id: string }>(slots: S[], machines: { id: string; refill_manual: boolean }[]): S[] {
  const byHand = new Set(machines.filter((machine) => machine.refill_manual).map((machine) => machine.id));
  return byHand.size === 0 ? slots : slots.filter((slot) => !byHand.has(slot.machine_id));
}
