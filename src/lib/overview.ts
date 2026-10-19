// Revenue machine by machine for the owner's overview (Xin, 19-10-2026:
// "omzet per automaat instead of a total"): pure, so the server page, the
// preview and the tests build it the same way. Kept out of the card's own
// file: a value exported from a "use client" module reaches a server
// component as a stand-in, not as itself (on 19-10-2026 PERIODS.map broke
// the live overview that way).

import { compareMoneySince, type Verdict } from "@/lib/stats";
import { machineFill, machineTotals, slotsFilledByVendly, type FillBand } from "@/lib/stock";
import { terminalStatus, type TerminalStatus } from "@/lib/terminal-status";
import type { Machine, SlotStock, StatsReport } from "@/lib/types";

export type PeriodKey = "today" | "week" | "month";
export const PERIODS: PeriodKey[] = ["today", "week", "month"];

/** One machine, or all together, over one period, verdict included. */
export type RevenueFigure = {
  revenue: number;
  units: number;
  prevRevenue: number;
  verdict: Verdict;
  /** "New since …" when it only started selling during the earlier period. */
  newLabel?: string;
};

export type RevenueMachine = {
  id: string;
  name: string;
  photoPath: string | null;
  status: TerminalStatus;
  fill: { percent: number; band: FillBand } | null;
  /** Its sales are typed in a day later (no payment terminal of ours yet): today stays empty. */
  late: boolean;
  lastRefill: { at: string; by: string | null; pieces: number } | null;
  figures: Record<PeriodKey, RevenueFigure>;
};

type Row = { units: number; prev_units: number; revenue: number; prev_revenue: number; first_sale: string | null };

/** Money shown, pieces tested: a mix shift is "about the same", not a real change. */
function figure(report: StatsReport, row: Row | undefined, newSince: (firstSale: string | null) => string | undefined): RevenueFigure {
  const verdict: Verdict = row
    ? compareMoneySince(row.units, row.prev_units, row.revenue, row.prev_revenue, row.first_sale, report.prev_start)
    : "tooFew";
  return {
    revenue: row?.revenue ?? 0,
    units: row?.units ?? 0,
    prevRevenue: row?.prev_revenue ?? 0,
    verdict,
    newLabel: verdict === "new" ? newSince(row?.first_sale ?? null) : undefined,
  };
}

/**
 * "Koekelare Chens Garden" as "Koekelare" in the owner's own list: every
 * machine there is theirs, so their name after each one only takes room.
 */
export function withoutOrgName(name: string, orgName: string | null): string {
  if (!orgName?.trim()) return name;
  const suffix = ` ${orgName.trim()}`.toLocaleLowerCase("nl-BE");
  const short = name.toLocaleLowerCase("nl-BE").endsWith(suffix) ? name.slice(0, name.length - suffix.length).trim() : name;
  return short || name;
}

/**
 * Every machine with its money for today, this week and this month, how full
 * it is and when it was last filled, and all of them together. A machine
 * filled by hand, or of the "other" kind, has no fill to show.
 */
export function revenueByMachine(input: {
  reports: Record<PeriodKey, StatsReport>;
  machines: Machine[];
  stock: SlotStock[];
  refills: Map<string, { at: string; by: string | null; pieces: number }>;
  orgName: string | null;
  newSince: (firstSale: string | null) => string | undefined;
}): { machines: RevenueMachine[]; totals: Record<PeriodKey, RevenueFigure> } {
  const { reports, newSince } = input;
  const fills = machineTotals(
    slotsFilledByVendly(input.stock, input.machines)
      .filter((slot) => slot.product_id)
      .map((slot) => ({ machine_id: slot.machine_id, stock: slot.stock, capacity: slot.capacity })),
  );
  const perPeriod = <T,>(make: (key: PeriodKey) => T) =>
    Object.fromEntries(PERIODS.map((key) => [key, make(key)])) as Record<PeriodKey, T>;
  return {
    machines: input.machines.map((mc) => {
      const total = fills.get(mc.id);
      return {
        id: mc.id,
        name: withoutOrgName(mc.name, input.orgName),
        photoPath: mc.photo_path,
        status: terminalStatus(mc.last_connected_at, mc.last_disconnected_at),
        fill: total && mc.type !== "other" ? machineFill(total.stock, total.capacity, total.counted) : null,
        // Without a payment terminal of ours its sales are typed in a day later (Gits, Televend).
        late: !mc.payter_serial_number,
        lastRefill: input.refills.get(mc.id) ?? null,
        figures: perPeriod((key) => figure(reports[key], reports[key].by_machine.find((row) => row.machine_id === mc.id), newSince)),
      };
    }),
    totals: perPeriod((key) => figure(reports[key], { ...reports[key].totals, first_sale: reports[key].first_sale }, newSince)),
  };
}
