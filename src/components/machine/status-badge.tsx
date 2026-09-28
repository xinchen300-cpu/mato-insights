import { cn } from "@/lib/utils";
import type { TerminalStatus } from "@/lib/terminal-status";

const DOT: Record<TerminalStatus, string> = {
  online: "bg-positive",
  offline: "bg-negative",
  unknown: "bg-muted-foreground/40",
};

export function StatusBadge({ status, label, className }: { status: TerminalStatus; label: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold", className)}>
      <span className={cn("size-2 rounded-full", DOT[status])} />
      <span className={status === "offline" ? "text-negative" : "text-muted-foreground"}>{label}</span>
    </span>
  );
}
