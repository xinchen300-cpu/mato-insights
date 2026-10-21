import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One line in a list, the way a banking app shows a payment: something to
 * recognise it by on the left, two lines of text, the number on the right.
 * Generous height, no grid lines; rows are separated by space and a hairline.
 */
export function ListRow({
  href,
  leading,
  title,
  subtitle,
  value,
  valueSub,
  chevron = false,
  className,
}: {
  href?: string;
  leading?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  value?: React.ReactNode;
  valueSub?: React.ReactNode;
  chevron?: boolean;
  className?: string;
}) {
  const body = (
    <>
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold tracking-[-0.01em]">{title}</span>
        {subtitle && <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{subtitle}</span>}
      </span>
      {(value || valueSub) && (
        <span className="shrink-0 text-right">
          {value && <span className="tabular block text-[15px] font-semibold tracking-[-0.01em]">{value}</span>}
          {valueSub && <span className="mt-0.5 block text-[13px]">{valueSub}</span>}
        </span>
      )}
      {chevron && <ChevronRight className="size-4 shrink-0 text-muted-foreground/70" aria-hidden="true" />}
    </>
  );
  const classes = cn("flex min-h-16 items-center gap-3.5 rounded-xl px-3 py-3", className);
  return href ? (
    <Link href={href} className={cn(classes, "hover-surface transition-transform duration-150 active:scale-[0.99]")}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}

/** A list of rows inside one card. */
export function RowList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <ul className={cn("surface-card stagger flex flex-col p-2", className)}>{children}</ul>;
}

/** A round token at the start of a row: an icon, or the first letter of a name. */
export function Avatar({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "gold" | "positive" | "negative" | "warning";
  className?: string;
}) {
  const tones = {
    neutral: "bg-surface text-foreground",
    gold: "bg-primary/12 text-gold-ink",
    positive: "bg-positive/12 text-positive",
    negative: "bg-negative/10 text-negative",
    warning: "bg-warning/12 text-warning",
  } as const;
  return (
    <span
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-full text-[14px] font-semibold [&_svg]:size-[18px]",
        tones[tone],
        className,
      )}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

/** The first letter of a machine or product name, for an Avatar. */
export function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "·";
}
