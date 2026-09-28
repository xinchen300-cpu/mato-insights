import { cn } from "@/lib/utils";
import { fillLevel, levelColor } from "@/lib/stock";
import type { SlotSize } from "@/lib/types";

export type FrontSlot = {
  key: string;
  selection: string;
  size: SlotSize;
  capacity: number;
  stock: number | null;
  productName: string | null;
  photoUrl: string | null;
  /** Colour of the business the slot belongs to, only on a shared machine. */
  ownerTone?: string | null;
};

// Distinct from the green/red stock levels, so ownership never reads as stock.
export const OWNER_TONES = ["var(--chart-1)", "var(--foreground)", "var(--chart-5)", "var(--chart-2)"];

const grow: Record<SlotSize, number> = { small: 1, ice: 0.8, large: 1.35, wide: 2 };

// The machine seen from the front: rows top to bottom, slots left to right.
// Shared by the machine page, the layout builder and the refill screens.
export function FrontView({
  rows,
  showStock = true,
  selectedKey,
  onSlotClick,
  renderSlotFooter,
}: {
  rows: FrontSlot[][];
  showStock?: boolean;
  selectedKey?: string | null;
  onSlotClick?: (slot: FrontSlot) => void;
  renderSlotFooter?: (slot: FrontSlot) => React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-fit border-[6px] border-foreground bg-foreground p-1.5">
        <div className="flex flex-col gap-1.5">
          {rows.map((row, rowIndex) => (
            <div key={rowIndex} className="flex gap-1.5 border-b-4 border-[#3a342b] bg-[#2a251e] p-1.5">
              {row.map((slot) => {
                const level = fillLevel(slot.stock, slot.capacity);
                const className = cn(
                  "flex min-w-[52px] flex-col bg-card text-left",
                  onSlotClick && "cursor-pointer transition-transform hover:-translate-y-0.5",
                  selectedKey === slot.key && "outline-2 outline-offset-1 outline-primary",
                );
                const style = { flexGrow: grow[slot.size], flexBasis: 0 };
                const content = (
                  <>
                    {slot.ownerTone && <div className="h-[3px]" style={{ background: slot.ownerTone }} />}
                    <div className="flex items-center justify-between gap-1 px-1.5 pt-1">
                      <span className="font-mono text-[11px] font-bold text-foreground">{slot.selection}</span>
                      {showStock && slot.stock !== null && (
                        <span className="tabular font-mono text-[10px] text-muted-foreground">
                          {slot.stock}/{slot.capacity}
                        </span>
                      )}
                    </div>
                    <div className="flex h-11 items-center justify-center px-1">
                      {slot.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={slot.photoUrl} alt="" className="max-h-10 max-w-full object-contain" />
                      ) : (
                        <span className="line-clamp-2 text-center text-[10.5px] leading-tight text-muted-foreground">
                          {slot.productName ?? "—"}
                        </span>
                      )}
                    </div>
                    {showStock && (
                      <div className="h-1.5 bg-level-empty/60">
                        <div
                          className={cn("h-full", levelColor[level])}
                          style={{
                            width:
                              slot.stock === null ? "0%" : `${Math.min(100, (slot.stock / slot.capacity) * 100)}%`,
                          }}
                        />
                      </div>
                    )}
                    {renderSlotFooter?.(slot)}
                  </>
                );
                return onSlotClick ? (
                  <button
                    key={slot.key}
                    type="button"
                    onClick={() => onSlotClick(slot)}
                    style={style}
                    className={className}
                  >
                    {content}
                  </button>
                ) : (
                  <div key={slot.key} style={style} className={className}>
                    {content}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function StockLegend({
  labels,
}: {
  labels: { full: string; half: string; low: string; empty: string; unknown: string };
}) {
  const items: [string, string][] = [
    ["bg-level-full", labels.full],
    ["bg-level-half", labels.half],
    ["bg-level-low", labels.low],
    ["bg-level-empty", labels.empty],
  ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      {items.map(([color, label]) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <span className={cn("size-2.5", color)} />
          {label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 border border-dashed border-muted-foreground" />
        {labels.unknown}
      </span>
    </div>
  );
}

export function OwnerLegend({ owners }: { owners: { name: string; tone: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      {owners.map((owner) => (
        <span key={owner.name} className="inline-flex items-center gap-1.5">
          <span className="h-[3px] w-4" style={{ background: owner.tone }} />
          {owner.name}
        </span>
      ))}
    </div>
  );
}
