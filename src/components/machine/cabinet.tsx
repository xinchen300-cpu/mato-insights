"use client";

import { SLOT_GROW, type FrontSlot } from "@/components/machine/front-view";
import { fillLevel, levelColor } from "@/lib/stock";
import { cn } from "@/lib/utils";

/** Up to this many items a slot shows each as a piece in its spiral; more, and one bar says how full it is. */
const PIECES_UP_TO = 12;

/**
 * The machine's glass front, for whoever fills it (Xin, 23-10-2026: "that it makes you feel like you are refilling an
 * automaat"): a black frame, the glass with its light strip, every shelf with its white number labels and what lies on
 * it. The side column and the drawer went the same day (Xin: "not practical for a person to refill … you can remove the
 * trekken part and also the menu on the right"): the shelves get the whole width. Black in both themes, as the real
 * one; inside it the dark theme's colours, so the minus and plus of the refill page read on the glass.
 */
export function CabinetView({
  rows,
  roomy = false,
  renderSlotFooter,
}: {
  rows: FrontSlot[][];
  /** Wider slots, for the minus and plus under each; a long shelf then scrolls behind the glass. */
  roomy?: boolean;
  renderSlotFooter?: (slot: FrontSlot) => React.ReactNode;
}) {
  return (
    <div className="dark cabinet rounded-[22px] p-2 text-foreground sm:p-3">
      <div className="cabinet-glass rounded-[14px]">
        {/* Room on the left for the light strip. To look, a shelf fits the glass, names wrapped; to count, the slots
            widen for the minus and plus and a long shelf scrolls behind the glass while the frame stays put. */}
        <div className="overflow-x-auto py-3 pl-4 pr-2 sm:py-4 sm:pl-6 sm:pr-4">
          <div className={cn("flex flex-col gap-3 sm:gap-4", roomy && "min-w-fit")}>
            {rows.map((row, rowIndex) => (
              <div key={rowIndex} className="flex">
                {row.map((slot, index) => (
                  <Bay
                    key={slot.key}
                    slot={slot}
                    roomy={roomy}
                    first={index === 0}
                    last={index === row.length - 1}
                    footer={renderSlotFooter?.(slot)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** One slot: what lies in it behind the glass, the shelf's edge with its number label, and below it the minus and plus. */
function Bay({
  slot,
  roomy,
  first,
  last,
  footer,
}: {
  slot: FrontSlot;
  roomy: boolean;
  first: boolean;
  last: boolean;
  footer: React.ReactNode;
}) {
  const level = fillLevel(slot.stock, slot.capacity);
  return (
    <div
      style={{ flexGrow: SLOT_GROW[slot.size], flexBasis: 0 }}
      className={cn("flex min-w-0 flex-col", roomy && "min-w-[76px]")}
    >
      <div
        className={cn(
          "cabinet-bay flex h-[60px] flex-col items-center justify-end gap-1.5 px-1 pb-1.5 sm:h-[72px]",
          !first && "border-l border-foreground/[0.07]",
        )}
      >
        {slot.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={slot.photoUrl} alt="" className="max-h-8 max-w-full object-contain drop-shadow-[0_4px_6px_rgb(0_0_0/0.6)] sm:max-h-11" />
        ) : (
          <span className="line-clamp-2 hyphens-auto text-center text-[9.5px] font-medium leading-tight text-foreground/85 [overflow-wrap:anywhere] sm:text-[11px]">
            {slot.productName}
          </span>
        )}
        {slot.productName !== null && <Pieces stock={slot.stock} capacity={slot.capacity} color={levelColor[level]} />}
      </div>
      <div
        className={cn(
          "cabinet-rail flex h-[18px] items-center justify-between gap-1 px-1 sm:h-5 sm:px-1.5",
          first && "rounded-l-[3px]",
          last && "rounded-r-[3px]",
        )}
      >
        <span className="cabinet-label tabular rounded-[3px] px-1 text-[9.5px] font-bold leading-[13px] sm:text-[10.5px] sm:leading-[15px]">
          {slot.selection}
        </span>
        {slot.stock !== null && !roomy && (
          <span className="tabular hidden text-[10px] font-medium text-muted-foreground sm:inline">
            {slot.stock}/{slot.capacity}
          </span>
        )}
      </div>
      {footer && <div className="pt-2">{footer}</div>}
    </div>
  );
}

/** What is left in the spiral, one piece per place, in the colour of how full the slot is. */
function Pieces({ stock, capacity, color }: { stock: number | null; capacity: number; color: string }) {
  if (capacity > PIECES_UP_TO) {
    return (
      <div className="h-1 w-full overflow-hidden rounded-full bg-foreground/15" aria-hidden="true">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${stock === null ? 0 : Math.min(100, (stock / capacity) * 100)}%` }} />
      </div>
    );
  }
  return (
    <div className="flex w-full gap-[2px]" aria-hidden="true">
      {Array.from({ length: capacity }, (_, place) => (
        <span
          key={place}
          className={cn("h-[5px] flex-1 rounded-full", stock !== null && place < stock ? color : "bg-foreground/15")}
        />
      ))}
    </div>
  );
}
