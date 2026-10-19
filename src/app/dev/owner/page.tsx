import { notFound } from "next/navigation";
import { LiveSales } from "@/components/live-sales";
import { MachineRevenue, type RevenueFigure, type RevenueMachine } from "@/components/overview/machine-revenue";
import type { LiveSale } from "@/lib/data";

/**
 * The owner's revenue per machine and Net verkocht on made-up data, for seeing
 * them while designing: /dev/owner. Nothing is read from or written to a
 * database. Only on a developer's own machine: production says not found.
 */
export default function OwnerPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const { machines, totals, sales } = sample();
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-8">
      <MachineRevenue machines={machines} totals={totals} />
      <LiveSales initial={sales} />
    </main>
  );
}

/** Six machines like Chens Garden's and the last 34 sales, made up around this moment. */
function sample() {
  const now = Date.now();
  const iso = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();
  const fig = (revenue: number, units: number, prevRevenue: number, verdict: RevenueFigure["verdict"] = "noise"): RevenueFigure => ({
    revenue,
    units,
    prevRevenue,
    verdict,
  });
  const machine = (
    id: string,
    name: string,
    today: RevenueFigure,
    week: RevenueFigure,
    month: RevenueFigure,
    extra: Partial<RevenueMachine> = {},
  ): RevenueMachine => ({
    id,
    name,
    photoPath: null,
    status: "online",
    fill: { percent: 64, band: "green" },
    late: false,
    lastRefill: { at: iso(180), by: "Alus", pieces: 14 },
    figures: { today, week, month },
    ...extra,
  });
  const machines = [
    machine("m-koek", "Koekelare", fig(84.5, 8, 61), fig(402, 39, 380), fig(1650.2, 160, 1420, "up")),
    machine("m-roes", "Roeselare", fig(52, 5, 40), fig(260, 25, 0, "new"), fig(812, 78, 0, "new"), {
      fill: { percent: 45, band: "orange" },
      lastRefill: { at: iso(26 * 60), by: "Alus", pieces: 9 },
    }),
    machine("m-kort", "Kortemark", fig(31.5, 3, 42), fig(198, 19, 230), fig(905, 87, 1010, "down"), {
      fill: { percent: 22, band: "red" },
    }),
    machine("m-diks", "Diksmuide", fig(21, 2, 30), fig(150, 15, 160), fig(700, 70, 690)),
    machine("m-gits", "Gits", fig(0, 0, 70, "tooFew"), fig(320, 31, 300), fig(1200, 118, 1180), {
      late: true,
      lastRefill: { at: iso(4 * 24 * 60), by: "Alus", pieces: 16 },
    }),
    machine("m-tor", "Torhout", fig(140, 14, 150), fig(910, 93, 880), fig(3800, 380, 3650), {
      fill: null,
      lastRefill: null,
    }),
  ];
  const sum = (key: "today" | "week" | "month") =>
    fig(
      machines.reduce((s, mc) => s + mc.figures[key].revenue, 0),
      machines.reduce((s, mc) => s + mc.figures[key].units, 0),
      machines.reduce((s, mc) => s + mc.figures[key].prevRevenue, 0),
    );
  const dishes = ["Bami goreng", "Nasi goreng", "Kip zoetzuur", "Loempia", "Babi pangang", "Mihoen", "Kipcurry"];
  const sales: LiveSale[] = Array.from({ length: 34 }, (_, i) => ({
    id: `s-${i}`,
    occurredAt: iso(3 + i * 47),
    createdAt: iso(2 + i * 47),
    amount: [9.5, 10.5, 11, 4, 12.5][i % 5],
    machineId: machines[i % machines.length].id,
    machineName: machines[i % machines.length].name,
    productName: dishes[i % dishes.length],
    selection: String(11 + (i % 9)),
  }));
  return { machines, totals: { today: sum("today"), week: sum("week"), month: sum("month") }, sales };
}
