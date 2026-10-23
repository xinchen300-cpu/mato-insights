"use client";

import { Nfc } from "lucide-react";
import { VendlyWordmark } from "@/components/brand/vendly-mark";
import { SLOT_GROW, type FrontSlot } from "@/components/machine/front-view";
import { useI18n } from "@/i18n/client";
import { fillLevel, levelColor } from "@/lib/stock";
import type { TerminalStatus } from "@/lib/terminal-status";
import { cn } from "@/lib/utils";

/** Up to this many items a slot shows each as a piece in its spiral; more, and one bar says how full it is. */
const PIECES_UP_TO = 12;

/**
 * The machine as it stands at its spot, for whoever fills it (Xin, 23-10-2026: "that it makes you feel like you are
 * refilling an automaat"): a black cabinet, the glass with its light strip, every shelf with its white number labels
 * and what lies on it, beside it the brand, a small screen with how full it is, the keys and the card reader, and the
 * drawer below. Black in both themes, as the real one; inside it the dark theme's colours, so the minus and plus of
 * the refill page read on the glass. The card reader's light is the terminal's own status.
 */
export function CabinetView({
  rows,
  roomy = false,
  renderSlotFooter,
  terminal = "unknown",
}: {
  rows: FrontSlot[][];
  /** Wider slots, for the minus and plus under each; a long shelf then scrolls behind the glass. */
  roomy?: boolean;
  renderSlotFooter?: (slot: FrontSlot) => React.ReactNode;
  terminal?: TerminalStatus;
}) {
  const { m } = useI18n();
  const counted = rows.flat().filter((slot) => slot.stock !== null && slot.capacity > 0);
  const capacity = counted.reduce((sum, slot) => sum + slot.capacity, 0);
  const stock = counted.reduce((sum, slot) => sum + (slot.stock ?? 0), 0);
  const percent = capacity > 0 ? Math.round((stock / capacity) * 100) : null;
  // "MATO Info" as on the machine's own panel: the mark large, the rest small under it.
  const [mark, ...rest] = m.brand.name.toUpperCase().split(" ");

  return (
    <div className="dark cabinet grid grid-cols-[minmax(0,1fr)_38px] grid-rows-[1fr_auto] gap-x-1.5 rounded-[22px] p-2 text-foreground sm:grid-cols-[minmax(0,1fr)_84px] sm:gap-x-2.5 sm:p-3">
      <div className="cabinet-glass rounded-[14px]">
        {/* Room on the left for the light strip. To look, a shelf fits the glass, names wrapped; to count, the slots
            widen for the minus and plus and a long shelf scrolls behind the glass while the cabinet stays put. */}
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

      {/* The column beside the glass, top to bottom as on the machine. */}
      <div className="row-span-2 flex flex-col items-center gap-2.5 rounded-[12px] bg-foreground/[0.035] px-1 py-3 ring-1 ring-inset ring-foreground/[0.06] sm:gap-3.5 sm:px-2.5 sm:py-4">
        <div className="flex flex-col items-center leading-none">
          <span className="text-[8.5px] font-extrabold tracking-[0.06em] sm:text-[15px]">{mark}</span>
          {rest.length > 0 && (
            <span className="mt-0.5 text-[5px] font-semibold tracking-[0.3em] text-muted-foreground sm:mt-1 sm:text-[7px]">
              {rest.join(" ")}
            </span>
          )}
        </div>
        {/* The screen above the keys shows the app's own logo, as the machine's shows its maker's. */}
        <div className="hidden h-16 w-full place-items-center rounded-md bg-background px-1.5 ring-1 ring-inset ring-foreground/10 sm:grid">
          <VendlyWordmark name={m.brand.name} className="h-auto w-full text-foreground" />
        </div>
        <div className="cabinet-lcd tabular grid h-5 w-full place-items-center rounded-[3px] font-mono text-[9px] font-semibold sm:h-7 sm:text-[13px]">
          {percent !== null ? `${percent}%` : ""}
        </div>
        <div className="grid w-[22px] grid-cols-3 gap-[3px] sm:w-[46px] sm:gap-1.5" aria-hidden="true">
          {Array.from({ length: 12 }, (_, key) => (
            <span key={key} className="aspect-square rounded-[2px] bg-foreground/20" />
          ))}
        </div>
        <div className="relative grid h-9 w-[26px] place-items-center rounded-[5px] bg-background ring-1 ring-inset ring-foreground/15 sm:h-14 sm:w-[46px]">
          <span
            className={cn(
              "absolute top-1 size-1 rounded-full sm:top-1.5 sm:size-1.5",
              terminal === "online"
                ? "bg-level-full shadow-[0_0_6px_var(--level-full)]"
                : terminal === "offline"
                  ? "bg-level-low"
                  : "bg-foreground/25",
            )}
          />
          <Nfc className="mt-1 size-3 text-muted-foreground sm:size-5" aria-hidden="true" />
        </div>
        <span className="mt-auto h-5 w-5 rounded-[3px] bg-background ring-1 ring-inset ring-foreground/10 sm:h-8 sm:w-8" />
      </div>

      {/* The drawer the customer pulls, with its light. */}
      <div className="flex flex-col items-center gap-1.5 pt-2 sm:gap-2 sm:pt-3">
        <span className="h-[3px] w-6 rounded-full bg-level-full shadow-[0_0_8px_var(--level-full)] sm:w-8" />
        <div className="cabinet-drawer grid h-11 w-[78%] place-items-center rounded-[9px] sm:h-14">
          <span className="text-[11px] font-bold tracking-[0.3em] text-foreground/80 sm:text-[14px]">{m.machines.cabinetPull}</span>
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
