"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { addDays, daysBetween, endOfMonth, MONTH_MODE_DAYS } from "@/lib/expiry";
import { cn } from "@/lib/utils";

const DAY_CHIPS = [0, 1, 2, 3, 5, 7, 14];
const MONTH_CHIPS = [0, 1, 2, 3, 6, 12];

/**
 * Picking a date in a storage room, with one tap. The suggested date from the
 * product's shelf life is already filled in, so most lines are never touched;
 * long-keeping food is picked by month, where a day would be false precision.
 */
export function ExpiryPicker({
  value,
  onChange,
  shelfLifeDays,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  shelfLifeDays: number | null;
  className?: string;
}) {
  const { m, f } = useI18n();
  const [open, setOpen] = useState(false);
  const byMonth = (shelfLifeDays ?? 0) >= MONTH_MODE_DAYS;

  const chips = byMonth
    ? MONTH_CHIPS.map((months) => ({
        key: `m${months}`,
        label: f.monthYear(`${endOfMonth(months)}T12:00:00Z`),
        value: endOfMonth(months),
      }))
    : DAY_CHIPS.map((days) => ({
        key: `d${days}`,
        label: days === 0 ? m.refill.dateToday : `+${days}`,
        value: addDays(days),
      }));

  const away = daysBetween(value);

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-xs font-semibold",
          open ? "border-foreground bg-surface" : "bg-card",
          away < 0 && "border-negative text-negative",
        )}
      >
        <CalendarDays className="size-3.5" />
        {byMonth ? f.monthYear(`${value}T12:00:00Z`) : f.dayMonth(`${value}T12:00:00Z`)}
      </button>

      {open && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => {
                onChange(chip.value);
                setOpen(false);
              }}
              className={cn(
                "border px-2 py-1.5 text-xs font-semibold",
                chip.value === value ? "border-foreground bg-foreground text-background" : "bg-card",
              )}
            >
              {chip.label}
            </button>
          ))}
          <input
            type="date"
            value={value}
            aria-label={m.refill.expiryDate}
            onChange={(e) => e.target.value && onChange(e.target.value)}
            className="h-8 border border-input bg-card px-2 text-xs"
          />
        </div>
      )}

      {!open && away >= 0 && (
        <span className="text-xs text-muted-foreground">{fmt(m.refill.daysLeft, { days: away })}</span>
      )}
    </div>
  );
}
