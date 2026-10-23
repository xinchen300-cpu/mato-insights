import Link from "next/link";
import { ChevronRight, ClipboardList } from "lucide-react";
import { fmt } from "@/i18n/format";
import type { Messages } from "@/i18n/messages";
import type { OpenRound } from "@/lib/data";
import { cn } from "@/lib/utils";

/**
 * The round to do now, as one big card: where it goes, how far along it is,
 * and one black button. The filler's home leads with it, and so does the
 * owner's for a round of their own (Xin, 20-10-2026: the start button vanished
 * while their own round held every machine).
 */
export function NextRound({ round, m }: { round: OpenRound; m: Messages }) {
  const underway = Boolean(round.readyAt);
  const done = round.machines.filter((machine) => machine.done).length;
  return (
    <Link
      href={`/vullen/${round.id}`}
      className="flex min-h-20 items-center gap-3.5 rounded-2xl bg-foreground px-4 py-3.5 text-background shadow-[var(--shadow-pop)] transition-transform active:scale-[0.99]"
    >
      <span
        className={cn("grid size-12 shrink-0 place-items-center rounded-full", underway ? "bg-positive text-white" : "bg-background/15")}
      >
        <ClipboardList className="size-6" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[20px] font-semibold tracking-[-0.01em]">{underway ? m.refill.continueFilling : m.me.nextBegin}</span>
        <span className="truncate text-[13.5px] opacity-75">
          {fmt(round.machines.length === 1 ? m.me.nextSubOne : m.me.nextSub, { n: round.machines.length, done })}
        </span>
      </span>
      <ChevronRight className="size-6 shrink-0" aria-hidden="true" />
    </Link>
  );
}
