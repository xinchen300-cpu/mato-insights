import { cn } from "@/lib/utils";
import type { TerminalStatus } from "@/lib/terminal-status";

const DOT: Record<TerminalStatus, string> = {
  online: "bg-positive",
  offline: "bg-negative",
  unknown: "bg-muted-foreground/40",
};

/** A status the size of a word: a small dot, a quiet label. No badge. */
export function StatusBadge({ status, label, className }: { status: TerminalStatus; label: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[13px] font-medium", className)}>
      <span className={cn("size-1.5 rounded-full", DOT[status])} />
      <span className={status === "offline" ? "text-negative" : "text-muted-foreground"}>{label}</span>
    </span>
  );
}
