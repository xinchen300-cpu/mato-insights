import Link from "next/link";
import { MachinePhoto } from "@/components/machine/machine-photo";
import { StatusDot } from "@/components/machine/status-badge";
import { fmt } from "@/i18n/format";
import type { Messages } from "@/i18n/messages";
import { bandBg, type FillBand } from "@/lib/stock";
import type { TerminalStatus } from "@/lib/terminal-status";
import { cn } from "@/lib/utils";

export type GridMachine = {
  id: string;
  name: string;
  photoPath: string | null;
  status: TerminalStatus;
  /** How full it is, from the counted slots; null when none was counted. */
  fill: { percent: number; band: FillBand } | null;
  /** Slots nearly or completely empty. */
  low: number;
};

/** Every machine as a tile for whoever fills: its photo, how full it is, whether it is online. A tap opens it. */
export function MachineGrid({ machines, m }: { machines: GridMachine[]; m: Messages }) {
  return (
    <ul className="stagger grid grid-cols-2 gap-3 lg:grid-cols-3">
      {machines.map((machine) => (
        <li key={machine.id}>
          <Link
            href={`/refill/machines/${machine.id}`}
            className="surface-card hover-surface flex h-full flex-col overflow-hidden transition-transform duration-150 active:scale-[0.99]"
          >
            <MachinePhoto path={machine.photoPath}>
              <span className="absolute left-2.5 top-2.5 grid size-6 place-items-center rounded-full bg-card/90">
                <StatusDot status={machine.status} />
              </span>
              <span
                className={cn(
                  "tabular absolute right-2.5 top-2.5 rounded-full px-2.5 py-1 text-[13px] font-bold",
                  machine.fill ? cn(bandBg[machine.fill.band], "text-white") : "bg-card/90 text-muted-foreground",
                )}
              >
                {machine.fill ? `${machine.fill.percent}%` : "?"}
              </span>
            </MachinePhoto>
            <span className="flex flex-col gap-0.5 p-3">
              <span className="truncate text-[15px] font-semibold tracking-[-0.01em]">{machine.name}</span>
              <span className={cn("text-[13px] leading-snug", machine.low > 0 ? "font-medium text-level-low" : "text-muted-foreground")}>
                {machine.low > 0 ? fmt(m.overview.slotsLow, { count: machine.low }) : machine.fill ? m.refill.machineOk : m.overview.stockUnknown}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
