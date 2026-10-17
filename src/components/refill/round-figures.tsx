import type { Messages } from "@/i18n/messages";
import type { RoundFigures as Figures } from "@/lib/refill-flow";
import { cn } from "@/lib/utils";

/**
 * A round in figures: what went along out of the stock, what went into the
 * machines, and where what came back went. Too Good To Go and the bin always
 * stand there, also at 0: "nothing thrown away" is worth seeing. Staff, other
 * and short only when they happened. Small, in a list: the four that matter.
 */
export function RoundFigures({ figures, m, size = "large" }: { figures: Figures; m: Messages; size?: "large" | "small" }) {
  const t = m.refill;
  const small = size === "small";
  const tiles = [
    { key: "taken", label: t.figTaken, value: figures.taken },
    { key: "filled", label: t.figFilled, value: figures.filled },
    ...(small ? [] : [{ key: "stock", label: t.figStock, value: figures.went.stock }]),
    { key: "promo", label: small ? t.figPromoShort : t.figPromo, value: figures.went.promo },
    { key: "waste", label: t.figWaste, value: figures.went.waste },
    ...(small
      ? []
      : [
          { key: "staff", label: t.figStaff, value: figures.went.staff },
          { key: "other", label: t.figOther, value: figures.went.other },
          { key: "short", label: t.figShort, value: figures.short },
        ].filter((tile) => tile.value > 0)),
  ];
  return (
    <dl className={cn("grid", small ? "grid-cols-4 gap-1.5" : "grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5")}>
      {tiles.map((tile) => (
        <div key={tile.key} className={cn("flex flex-col-reverse justify-end", small ? "gap-0.5 rounded-xl bg-surface px-2.5 py-2" : "surface-card gap-1 px-4 py-3.5")}>
          <dt className={cn("leading-tight text-muted-foreground", small ? "text-[11.5px]" : "text-[13.5px]")}>{tile.label}</dt>
          <dd className={cn("tabular font-semibold leading-none tracking-[-0.02em]", small ? "text-[18px]" : "text-[28px]")}>{tile.value}</dd>
        </div>
      ))}
    </dl>
  );
}
