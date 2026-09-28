import type { FrontSlot } from "@/components/machine/front-view";
import { mediaUrl } from "@/lib/media";
import type { LayoutRowSpec, SlotSize, SlotStock } from "@/lib/types";

export function toFrontRows(slots: SlotStock[], ownerTone?: (businessId: string | null) => string | null): FrontSlot[][] {
  const rows = new Map<number, FrontSlot[]>();
  for (const s of slots) {
    const row = rows.get(s.row_position) ?? [];
    row.push({
      key: s.slot_id,
      selection: s.selection_number,
      size: s.size,
      capacity: s.capacity,
      stock: s.stock,
      productName: s.product_name,
      photoUrl: mediaUrl(s.photo_path),
      ownerTone: ownerTone?.(s.business_id) ?? null,
    });
    rows.set(s.row_position, row);
  }
  return [...rows.entries()].sort(([a], [b]) => a - b).map(([, row]) => row);
}

// The fleet's convention: each row starts on a new ten (1–9, 11–19, 21–29…),
// small slots count by one and wide ones by two (1, 3, 5).
export function defaultStep(size: SlotSize) {
  return size === "large" || size === "wide" ? 2 : 1;
}

export function numberRow(rowIndex: number, count: number, step: number, first = rowIndex * 10 + 1): string[] {
  return Array.from({ length: count }, (_, i) => String(first + i * step));
}

export function expandTemplate(spec: LayoutRowSpec[]) {
  return spec.map((row, rowIndex) =>
    numberRow(rowIndex, row.slots, row.step || defaultStep(row.size)).map((selection) => ({
      selection_number: selection,
      size: row.size,
      depth: row.depth,
    })),
  );
}
