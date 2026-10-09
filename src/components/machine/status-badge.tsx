import { cn } from "@/lib/utils";
import type { TerminalStatus } from "@/lib/terminal-status";

const DOT: Record<TerminalStatus, string> = {
  online: "bg-positive",
  offline: "bg-negative",
  unknown: "bg-muted-foreground/40",
};

/** The dot alone: green and gently breathing when the terminal is up. */
export function StatusDot({ status, className }: { status: TerminalStatus; className?: string }) {
  return (
    <span className={cn("relative inline-flex size-2 shrink-0", className)} aria-hidden="true">
      {status === "online" && <span className="status-pulse absolute inset-0 rounded-full bg-positive" />}
      <span className={cn("relative inline-flex size-2 rounded-full", DOT[status])} />
    </span>
  );
}

/** A status the size of a word: a small dot, a quiet label. No badge. */
export function StatusBadge({
  status,
  label,
  className,
  hideLabel = false,
}: {
  status: TerminalStatus;
  label: string;
  className?: string;
  /** Only the dot on screen; the word stays for screen readers. */
  hideLabel?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[13px] font-medium", className)} title={label}>
      <StatusDot status={status} />
      <span
        className={cn(
          hideLabel && "sr-only",
          status === "offline" ? "text-negative" : status === "online" ? "text-positive" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </span>
  );
}
