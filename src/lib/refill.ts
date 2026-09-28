import type { RefillLine } from "@/lib/types";

/**
 * The date a slot filled today runs out, from the product's shelf life. Null
 * when the product has none: then nothing is tracked and nothing is asked.
 */
export function suggestedDate(line: RefillLine, now = new Date()): string | null {
  if (!line.shelf_life_days) return null;
  const day = new Date(now.getTime() + line.shelf_life_days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(day);
}

export function lineKey(line: Pick<RefillLine, "machine_id" | "selection_number">) {
  return `${line.machine_id}:${line.selection_number}`;
}

/** What to take from storage: all selected machines together, most first. */
export function combineByProduct(lines: RefillLine[]) {
  const totals = new Map<string, { productId: string; name: string; photoPath: string | null; quantity: number }>();
  for (const line of lines) {
    const entry = totals.get(line.product_id) ?? {
      productId: line.product_id,
      name: line.product_name,
      photoPath: line.photo_path,
      quantity: 0,
    };
    entry.quantity += line.to_add;
    totals.set(line.product_id, entry);
  }
  return [...totals.values()].sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name));
}

export function groupByMachine(lines: RefillLine[]) {
  const machines = new Map<string, { machineId: string; name: string; lines: RefillLine[] }>();
  for (const line of lines) {
    const entry = machines.get(line.machine_id) ?? { machineId: line.machine_id, name: line.machine_name, lines: [] };
    entry.lines.push(line);
    machines.set(line.machine_id, entry);
  }
  return [...machines.values()];
}
