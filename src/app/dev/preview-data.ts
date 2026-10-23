// Made-up rounds for the preview pages under /dev: three machines on a route
// near Diksmuide, Chinese takeaway dishes, and a filler called Jonas with a
// few weeks of rounds behind him. Nothing here comes from or goes to a database.

import type { RefillRound, RouteTimes } from "@/lib/data";
import { summarizeRound, type MyRound } from "@/lib/filler-stats";
import type { FlowLine, StopRecord } from "@/lib/refill-flow";
import { DEFAULT_ROUND_SETTINGS } from "@/lib/round-settings";

export type Scenario = "pick" | "run" | "back" | "done" | "first";
export const SCENARIOS: Scenario[] = ["pick", "run", "back", "done", "first"];

const MACHINES = [
  { id: "m-kortemark", name: "Kortemark Hoeve" },
  { id: "m-diksmuide", name: "Diksmuide Markt" },
  { id: "m-gits", name: "Gits Kerkplein" },
];
const PRODUCTS = ["Bami goreng", "Nasi goreng", "Loempia", "Kip zoetzuur", "Babi pangang", "Mihoen"];
/** Chosen for the round while it stood full: on the route, nothing to do there. */
const FULL = { id: "m-esen", name: "Esen Dorp" };

const minutes = (n: number) => n * 60_000;
const iso = (at: number) => new Date(at).toISOString();

function lines(): FlowLine[] {
  return MACHINES.flatMap((machine, m) =>
    PRODUCTS.map((name, i) => {
      const stock = (i + m) % 3;
      return {
        machineId: machine.id,
        selection: String(11 + i),
        row: 1 + Math.floor(i / 3),
        slot: 1 + (i % 3),
        productId: `p-${i}`,
        productName: name,
        photoPath: null,
        capacity: 4,
        stock: i === 4 && m === 1 ? null : stock,
        take: 4 - stock,
        expired: i === 2 && m === 0 ? 1 : 0,
      };
    }),
  );
}

/** A machine done the way the plan asked: every slot filled with what was set aside. */
function doneStop(machineId: string, plan: FlowLine[], checkedAt: number, completedAt: number): StopRecord {
  return {
    checkedAt: iso(checkedAt),
    completedAt: iso(completedAt),
    skipped: false,
    technical: false,
    note: null,
    lines: plan
      .filter((line) => line.machineId === machineId)
      .map((line) => ({ selection: line.selection, prepared: line.take, filled: line.take, removed: [], countAfter: null, full: false })),
  };
}

export function previewRound(scenario: Scenario, now: number): RefillRound {
  const plan = lines();
  const roundMachine = (machine: { id: string; name: string }, i: number) => ({
    ...machine,
    photoPath: null,
    status: machine.id === "m-gits" ? ("offline" as const) : ("online" as const),
    lastSale: iso(now - minutes(25 + i * 40)),
    // Gits is a snack machine in the preview: no question about dates there.
    type: machine.id === "m-gits" ? ("spiral" as const) : ("lift" as const),
    // The snack machine stands with Diksmuide, as at Chens Garden.
    address: `${machine.id === "m-gits" ? "Diksmuide" : machine.name.split(" ")[0]}, België`,
  });
  const picked = Object.fromEntries(
    plan.reduce((sum, line) => sum.set(`${line.machineId}:${line.productId}`, (sum.get(`${line.machineId}:${line.productId}`) ?? 0) + line.take), new Map<string, number>()),
  );
  const finished = scenario === "done" || scenario === "first";
  const readyAt = scenario === "pick" ? null : finished ? now - minutes(52) : now - minutes(31);
  const stops: Record<string, StopRecord> =
    scenario === "run"
      ? { [MACHINES[0].id]: doneStop(MACHINES[0].id, plan, now - minutes(19), now - minutes(13)) }
      : finished || scenario === "back"
        ? Object.fromEntries(
            MACHINES.map((machine, i) => [machine.id, doneStop(machine.id, plan, now - minutes(40 - i * 13), now - minutes(34 - i * 13))]),
          )
        : {};
  // Done: the box was two short of the first dish, so the last machine missed them: on the list for tomorrow.
  if (scenario === "done") {
    const last = MACHINES[MACHINES.length - 1].id;
    picked[`${last}:p-0`] -= 2;
    stops[last].lines = stops[last].lines.map((line) => (line.selection === "11" ? { ...line, filled: line.filled - 2 } : line));
  }
  // Bringing back: two Bami goreng and a Loempia did not fit, and one Loempia was past its date.
  if (scenario === "back") {
    const first = stops[MACHINES[0].id];
    first.lines = first.lines.map((line) =>
      line.selection === "11" ? { ...line, filled: Math.max(0, line.filled - 2) } : line.selection === "13" ? { ...line, filled: Math.max(0, line.filled - 1), removed: [{ reason: "expired", qty: 1 }] } : line,
    );
  }
  // What the done machines got, as the stock events of the round would say; their slots show it in.
  const changed: Record<string, number> = Object.fromEntries(
    Object.entries(stops).flatMap(([machineId, stop]) =>
      stop.completedAt ? stop.lines.filter((line) => line.filled > 0).map((line) => [`${machineId}:${line.selection}`, line.filled] as const) : [],
    ),
  );
  return {
    id: `preview-${scenario}`,
    number: 14,
    flowVersion: 2,
    createdAt: iso(now - minutes(90)),
    startedAt: readyAt === null ? null : iso(readyAt),
    readyAt: readyAt === null ? null : iso(readyAt),
    completedAt: finished ? iso(now) : null,
    machines: MACHINES.map(roundMachine),
    route: [...MACHINES.slice(0, 2), FULL, ...MACHINES.slice(2)].map(roundMachine),
    lines: plan,
    slots: [
      ...plan.map((line) => ({
        machineId: line.machineId,
        selection: line.selection,
        row: line.row,
        slot: line.slot,
        productId: line.productId,
        productName: line.productName,
        capacity: line.capacity,
        stock: line.stock === null ? null : Math.min(line.capacity, line.stock + (changed[`${line.machineId}:${line.selection}`] ?? 0)),
      })),
      ...PRODUCTS.slice(0, 3).map((name, i) => ({
        machineId: FULL.id,
        selection: String(11 + i),
        row: 1,
        slot: 1 + i,
        productId: `p-${i}`,
        productName: name,
        capacity: 4,
        stock: 4,
      })),
    ],
    picked: scenario === "pick" ? {} : picked,
    stops,
    changed,
    settings: { ...DEFAULT_ROUND_SETTINGS, checks: ["Ruit gepoetst"], depotAddress: "Roeselaarseweg 69, 8820 Torhout" },
    notes: scenario === "pick" ? "Diksmuide: de deur klemt, even duwen." : null,
  };
}

/** What earlier rounds measured on this route: every drive and every machine. */
export const previewTimes: RouteTimes = {
  machines: {
    "m-kortemark": { minutes: 6, count: 4 },
    "m-diksmuide": { minutes: 8, count: 4 },
    "m-gits": { minutes: 5, count: 4 },
  },
  legs: {
    "start→m-kortemark": { minutes: 12, count: 4 },
    "m-kortemark→m-diksmuide": { minutes: 9, count: 4 },
    "m-diksmuide→m-gits": { minutes: 7, count: 4 },
    "m-gits→end": { minutes: 15, count: 4 },
  },
};

/**
 * Jonas' earlier rounds on the same route, a week apart: four of them, so the
 * round under test is a record on that route. Summed up the way the database
 * sends them.
 */
export function previewHistory(scenario: Scenario, now: number): MyRound[] {
  if (scenario === "first") return [];
  const plan = lines();
  return [62, 58, 65, 60].map((took, i) => {
    const end = now - (4 - i) * 7 * 86_400_000;
    return summarizeRound({
      id: `history-${i}`,
      readyAt: iso(end - minutes(took)),
      completedAt: iso(end),
      machineIds: MACHINES.map((machine) => machine.id),
      stops: Object.fromEntries(MACHINES.map((machine) => [machine.id, doneStop(machine.id, plan, end - minutes(30), end - minutes(24))])),
    });
  });
}

/**
 * A few months of Jonas' rounds for the figures page: the long route most
 * weeks, a shorter one now and then, one with a skip, and a record. Summed up
 * the way the database sends them.
 */
export function previewFigures(now: number): MyRound[] {
  const plan = lines();
  const long = MACHINES.map((machine) => machine.id);
  const short = [MACHINES[0].id, MACHINES[2].id];
  const weeks: { machines: string[]; took: number; skip?: boolean }[] = [
    { machines: long, took: 66 }, { machines: long, took: 64 }, { machines: short, took: 41 }, { machines: long, took: 61 },
    { machines: long, took: 63 }, { machines: short, took: 44 }, { machines: long, took: 58, skip: true }, { machines: long, took: 60 },
    { machines: long, took: 59 }, { machines: short, took: 39 }, { machines: long, took: 62 }, { machines: long, took: 57 },
    { machines: long, took: 55 }, { machines: long, took: 58 },
  ];
  return weeks.map((week, i) => {
    const end = now - (weeks.length - 1 - i) * 4 * 86_400_000 - minutes(90);
    return summarizeRound({
      id: `figures-${i}`,
      readyAt: iso(end - minutes(week.took)),
      completedAt: iso(end),
      machineIds: week.machines,
      stops: Object.fromEntries(
        week.machines.map((id, j) => [
          id,
          week.skip && j === 1
            ? { checkedAt: null, completedAt: iso(end - minutes(20)), skipped: true, technical: false, note: null, lines: [] }
            : doneStop(id, plan, end - minutes(30 - j * 8), end - minutes(25 - j * 8)),
        ]),
      ),
    });
  });
}

export const previewMachineNames = Object.fromEntries(MACHINES.map((machine) => [machine.id, machine.name]));
