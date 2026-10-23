"use client";

import { Avatar } from "@/components/list-row";
import { cn } from "@/lib/utils";

export const selectClass =
  "h-10 rounded-xl border border-input bg-card px-3 text-[15px] outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 disabled:opacity-50";

/**
 * One setting: what it is and a word on it, and its control. A switch stays on the right, even on a phone; a wider
 * control drops under the words there.
 */
export function PrefRow({
  icon,
  title,
  hint,
  control,
  inline = false,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  hint?: React.ReactNode;
  control?: React.ReactNode;
  inline?: boolean;
}) {
  return (
    <div className={cn("flex gap-3 rounded-xl px-3 py-3", inline ? "items-center" : "flex-col sm:flex-row sm:items-center sm:gap-4")}>
      <div className="flex min-w-0 flex-1 items-center gap-3.5">
        <Avatar>{icon}</Avatar>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold tracking-[-0.01em]">{title}</p>
          {hint && <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{hint}</p>}
        </div>
      </div>
      {control && <div className={cn("shrink-0", !inline && "pl-[54px] sm:pl-0")}>{control}</div>}
    </div>
  );
}

/** A few choices side by side, one of them on. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-full border bg-card p-0.5", disabled && "opacity-60")}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            "h-9 rounded-full px-3.5 text-[14px] font-semibold transition-colors",
            option.value === value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** On or off, as the machine page's "filled by hand". */
export function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (on: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="grid h-11 w-14 place-items-center disabled:opacity-50"
    >
      <span className={cn("relative h-7 w-12 rounded-full transition-colors duration-200", on ? "bg-positive" : "bg-border")}>
        <span
          className={cn(
            "absolute top-0.5 left-0 size-6 rounded-full bg-white shadow-sm transition-transform duration-200",
            on ? "translate-x-[22px]" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}
