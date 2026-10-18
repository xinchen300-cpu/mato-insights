import Link from "next/link";
import { MachinePhoto } from "@/components/machine/machine-photo";
import { StatusDot } from "@/components/machine/status-badge";
import { plural } from "@/i18n/format";
import type { Messages } from "@/i18n/messages";
import { orderByRoute } from "@/lib/round-settings";
import { bandBg, fillLevel, machineFill, machineTotals, needsAttention, type FillBand } from "@/lib/stock";
import { terminalStatus, type TerminalStatus } from "@/lib/terminal-status";
import type { Machine, SlotStock } from "@/lib/types";
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
  /** No layout yet, so nothing to count or fill in it. */
  noLayout?: boolean;
};

/**
 * The tiles: every machine with a product in a slot, in the owner's route order.
 * With `withoutLayout`, also the machines still waiting for a layout (not the
 * "other" kind, which never gets one), so a filler sees the whole fleet.
 */
export function gridMachines(
  fleet: Machine[],
  slots: SlotStock[],
  route: string[],
  { withoutLayout = false }: { withoutLayout?: boolean } = {},
): GridMachine[] {
  const stocked = slots.filter((slot) => slot.product_id);
  const totals = machineTotals(stocked.map((slot) => ({ machine_id: slot.machine_id, stock: slot.stock, capacity: slot.capacity })));
  const low = new Map<string, number>();
  for (const slot of stocked) {
    if (needsAttention(fillLevel(slot.stock, slot.capacity))) low.set(slot.machine_id, (low.get(slot.machine_id) ?? 0) + 1);
  }
  const shown = fleet.filter((mc) => totals.has(mc.id) || (withoutLayout && mc.type !== "other"));
  return orderByRoute(shown.map((mc) => mc.id), route).map((id) => {
    const machine = fleet.find((mc) => mc.id === id)!;
    const total = totals.get(id);
    return {
      id,
      name: machine.name,
      photoPath: machine.photo_path,
      status: terminalStatus(machine.last_connected_at, machine.last_disconnected_at),
      fill: total ? machineFill(total.stock, total.capacity, total.counted) : null,
      low: low.get(id) ?? 0,
      noLayout: !total,
    };
  });
}

/**
 * Every machine as a tile for whoever fills: its photo, how full it is, whether it is online. A tap opens it;
 * `from` tells the machine page which page to go back to.
 */
export function MachineGrid({ machines, m, from }: { machines: GridMachine[]; m: Messages; from?: "machines" }) {
  return (
    <ul className="stagger grid grid-cols-2 gap-3 lg:grid-cols-3">
      {machines.map((machine) => (
        <li key={machine.id}>
          <Link
            href={from ? `/refill/machines/${machine.id}?from=${from}` : `/refill/machines/${machine.id}`}
            className="surface-card hover-surface flex h-full flex-col overflow-hidden transition-transform duration-150 active:scale-[0.99]"
          >
            <MachinePhoto path={machine.photoPath}>
              <span className="absolute left-2.5 top-2.5 grid size-6 place-items-center rounded-full bg-card/90">
                <StatusDot status={machine.status} />
                {/* The dot alone is colour only: its word for whoever cannot see it. */}
                <span className="sr-only">
                  {machine.status === "online" ? m.status.online : machine.status === "offline" ? m.status.offline : m.status.unknown}
                </span>
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
              <span
                className={cn(
                  "text-[13px] leading-snug",
                  machine.status === "offline" ? "font-semibold text-negative" : machine.low > 0 ? "font-medium text-level-low-strong" : "text-muted-foreground",
                )}
              >
                {/* Offline first: a machine that cannot take payments sells nothing, however full. */}
                {machine.status === "offline"
                  ? m.status.offline
                  : machine.low > 0
                  ? plural(machine.low, m.overview.slotsLowOne, m.overview.slotsLow)
                  : machine.noLayout
                    ? m.machines.noLayout
                    : machine.fill
                      ? m.refill.machineOk
                      : m.overview.stockUnknown}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
