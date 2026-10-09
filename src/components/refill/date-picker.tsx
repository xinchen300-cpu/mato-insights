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
        aria-expanded={open}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-colors duration-150",
          // Past its date stays red whether the chips are open or not.
          away < 0
            ? cn("bg-negative/10 text-negative hover:bg-negative/15", open && "ring-1 ring-inset ring-negative/40")
            : open
              ? "bg-foreground text-background"
              : "bg-surface text-foreground hover:bg-[#e6e6e9]",
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
                "inline-flex h-9 min-w-11 items-center justify-center rounded-full px-3 text-[13px] font-semibold transition-colors duration-150",
                chip.value === value
                  ? "bg-foreground text-background"
                  : "bg-card text-foreground shadow-[0_0_0_1px_var(--border)] hover:bg-surface",
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
            className="h-9 rounded-full border border-input bg-card px-3 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
          />
        </div>
      )}

      {!open && away >= 0 && (
        <span className="text-[13px] text-muted-foreground">{fmt(m.refill.daysLeft, { days: away })}</span>
      )}
    </div>
  );
}
