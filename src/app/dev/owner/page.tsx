import { notFound } from "next/navigation";
import { LiveSales } from "@/components/live-sales";
import { MachineRevenue } from "@/components/overview/machine-revenue";
import { RefillLog } from "@/components/stats/refill-log";
import { getI18n } from "@/i18n/server";
import type { LiveSale } from "@/lib/data";
import { PERIODS, revenueByMachine, type PeriodKey } from "@/lib/overview";
import type { Machine, SlotStock, StatsReport } from "@/lib/types";

/**
 * The owner's revenue per machine and Net verkocht on made-up data: /dev/owner.
 * Built the way the overview builds it, in a server component through
 * revenueByMachine, so what breaks there breaks here too. Nothing is read from
 * or written to a database. Only on a developer's own machine.
 */
export default async function OwnerPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const { m, f } = await getI18n();
  const { reports, machines, stock, refills, sales, visits } = sample();
  const revenue = revenueByMachine({
    reports,
    machines,
    stock,
    refills,
    orgName: "Chens Garden",
    newSince: (firstSale) => (firstSale ? `Nieuw sinds ${firstSale.slice(0, 10)}` : undefined),
  });
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-8">
      <MachineRevenue machines={revenue.machines} totals={revenue.totals} />
      <LiveSales initial={sales} />
      <RefillLog visits={visits} names={new Map(revenue.machines.map((mc) => [mc.id, mc.name]))} m={m} f={f} />
    </main>
  );
}

/** Six machines like Chens Garden's, their figures per period and the last 34 sales, made up around this moment. */
function sample() {
  const now = Date.now();
  const iso = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();
  // [revenue, units, previous revenue] for today, this week and this month; then how full and when filled.
  const fleet: { id: string; name: string; serial: boolean; figures: [number, number, number][]; fill: number | null; refilled: number | null }[] = [
    { id: "m-koek", name: "Koekelare Chens Garden", serial: true, figures: [[84.5, 8, 61], [402, 39, 380], [1650.2, 160, 1420]], fill: 0.64, refilled: 180 },
    { id: "m-roes", name: "Roeselare Chens Garden", serial: true, figures: [[52, 5, 40], [260, 25, 240], [812, 78, 790]], fill: 0.45, refilled: 26 * 60 },
    { id: "m-kort", name: "Kortemark Chens Garden", serial: true, figures: [[31.5, 3, 42], [198, 19, 230], [905, 87, 1010]], fill: 0.22, refilled: 180 },
    { id: "m-diks", name: "Diksmuide Chens Garden", serial: true, figures: [[21, 2, 30], [150, 15, 160], [700, 70, 690]], fill: 0.64, refilled: 180 },
    { id: "m-gits", name: "Gits Chens Garden", serial: false, figures: [[0, 0, 70], [320, 31, 300], [1200, 118, 1180]], fill: 0.62, refilled: 4 * 24 * 60 },
    { id: "m-tor", name: "Torhout Chens Garden", serial: true, figures: [[140, 14, 150], [910, 93, 880], [3800, 380, 3650]], fill: null, refilled: null },
  ];
  const machines: Machine[] = fleet.map((mc) => ({
    id: mc.id,
    name: mc.name,
    type: "lift",
    payter_serial_number: mc.serial ? `APO-${mc.id}` : null,
    business_id: null,
    shared_business_id: null,
    business_name: null,
    business_logo_path: null,
    data_since: null,
    km_round_trip: null,
    photo_path: null,
    last_connected_at: iso(5),
    last_disconnected_at: iso(60 * 24),
    terminal_model: null,
    terminal_network: null,
    terminal_flags: [],
    refill_manual: mc.fill === null,
    address: null,
  }));
  const stock = fleet.flatMap((mc) =>
    mc.fill === null
      ? []
      : [{ machine_id: mc.id, selection_number: "11", product_id: "p-1", capacity: 100, stock: Math.round(mc.fill * 100) } as unknown as SlotStock],
  );
  const refills = new Map(
    fleet.flatMap((mc) => (mc.refilled === null ? [] : [[mc.id, { at: iso(mc.refilled), by: "Alus", pieces: 12 }] as const])),
  );
  const report = (index: number): StatsReport => {
    const rows = fleet.map((mc) => {
      const [revenue, units, prev] = mc.figures[index];
      return {
        machine_id: mc.id,
        machine_name: mc.name,
        business_name: null,
        first_sale: "2026-01-01T00:00:00Z",
        revenue,
        units,
        prev_revenue: prev,
        prev_units: Math.round(units * (prev / Math.max(revenue, 1))),
      };
    });
    const sum = (key: "revenue" | "units" | "prev_revenue" | "prev_units") => rows.reduce((s, row) => s + row[key], 0);
    return {
      period: PERIODS[index],
      timezone: "Europe/Brussels",
      cur_start: iso(60),
      cur_end: iso(0),
      prev_start: "2026-09-01T00:00:00Z",
      prev_end: iso(60),
      first_sale: "2026-01-01T00:00:00Z",
      totals: { revenue: sum("revenue"), units: sum("units"), prev_revenue: sum("prev_revenue"), prev_units: sum("prev_units") },
      by_day: [],
      by_hour: [],
      by_weekday: [],
      by_machine: rows,
      by_product: [],
    };
  };
  const reports = Object.fromEntries(PERIODS.map((key, index) => [key, report(index)])) as Record<PeriodKey, StatsReport>;
  const dishes = ["Bami goreng", "Nasi goreng", "Kip zoetzuur", "Loempia", "Babi pangang", "Mihoen", "Kipcurry"];
  const sales: LiveSale[] = Array.from({ length: 34 }, (_, i) => ({
    id: `s-${i}`,
    occurredAt: iso(3 + i * 47),
    createdAt: iso(2 + i * 47),
    amount: [9.5, 10.5, 11, 4, 12.5][i % 5],
    machineId: fleet[i % fleet.length].id,
    machineName: fleet[i % fleet.length].name,
    productName: dishes[i % dishes.length],
    selection: String(11 + (i % 9)),
  }));
  // Three days of rounds: every machine around nine, Torhout by hand in the afternoon.
  const visits = [0, 1, 2].flatMap((day) =>
    fleet.map((mc, i) => ({
      machineId: mc.id,
      at: iso(day * 24 * 60 + (mc.fill === null ? 60 : 6 * 60 - i * 20)),
      pieces: 4 + ((i * 7 + day * 3) % 15),
      by: "Alus",
    })),
  );
  return { reports, machines, stock, refills, sales, visits };
}
