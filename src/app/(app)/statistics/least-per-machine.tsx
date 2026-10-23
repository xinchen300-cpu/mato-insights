import { ChevronRight, Link2 } from "lucide-react";
import { Avatar, ListRow, initial } from "@/components/list-row";
import { Section } from "@/components/page-header";
import { fmt, plural, type Formatters } from "@/i18n/format";
import type { Messages } from "@/i18n/messages";
import { getMachineStock, getStatsReport, type StatsFilters } from "@/lib/data";
import { mediaUrl } from "@/lib/media";
import type { SlotStock, StatsReport } from "@/lib/types";

/** Shown per machine before "Alle … gerechten" folds the rest. */
const SHOWN = 3;

export type Dish = { id: string; name: string; photo: string | null; units: number; revenue: number };

/**
 * Minst verkocht per automaat (Xin, 21-10-2026: "analyse van minste verkochte gerechten per automaat, per
 * maand"): for every machine in the filters, its dishes from the least sold up, the three slowest first.
 * Each machine's own report, with the page's period, so the figures are the ones its filter would show.
 * A dish in the machine now that sold nothing counts as nothing sold, but only while the period runs up to
 * today: for a month gone by, today's layout says nothing about what was in it then. Whether the slot was
 * empty is not known here, hence the hint above the list.
 */
export async function LeastPerMachine({
  orgId,
  filters,
  machines,
  includesNow,
  m,
  f,
}: {
  orgId: string;
  filters: StatsFilters;
  /** The machines in the filters, with the names to show. */
  machines: { id: string; name: string }[];
  includesNow: boolean;
  m: Messages;
  f: Formatters;
}) {
  const [reports, stock] = await Promise.all([
    fewAtATime(machines, 3, (machine) => getStatsReport(orgId, { ...filters, machines: [machine.id], businesses: null, products: null })),
    includesNow ? getMachineStock(orgId, machines.map((machine) => machine.id)) : Promise.resolve([]),
  ]);
  return <LeastPerMachineList perMachine={leastPerMachine(machines, reports, stock, includesNow)} m={m} f={f} />;
}

/**
 * A few at a time, in order: every machine's report at once kept the shared database busy for seconds, and every
 * other page waited with it (22-10-2026). This list streams in under the rest of the page anyway.
 */
async function fewAtATime<T, R>(items: T[], size: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await run(items[i]);
      }
    }),
  );
  return results;
}

export type MachineDishes = { machine: { id: string; name: string }; list: Dish[] };

/** Per machine its dishes from the least sold up; a machine with none stays away. Pure, for the page and its preview. */
export function leastPerMachine(
  machines: { id: string; name: string }[],
  reports: Pick<StatsReport, "by_product">[],
  stock: Pick<SlotStock, "machine_id" | "product_id" | "product_name" | "photo_path">[],
  includesNow: boolean,
): MachineDishes[] {
  return machines
    .map((machine, i) => {
      const dishes = new Map<string, Dish>();
      for (const row of reports[i].by_product) {
        if (!row.product_id) continue;
        dishes.set(row.product_id, {
          id: row.product_id,
          name: row.product_name ?? "",
          photo: row.photo_path,
          units: row.units,
          revenue: row.revenue,
        });
      }
      if (includesNow) {
        for (const slot of stock) {
          if (slot.machine_id !== machine.id || !slot.product_id || dishes.has(slot.product_id)) continue;
          dishes.set(slot.product_id, { id: slot.product_id, name: slot.product_name ?? "", photo: slot.photo_path, units: 0, revenue: 0 });
        }
      }
      // Sold only in the period before: not one of this period's dishes.
      const list = [...dishes.values()]
        .filter((dish) => dish.units > 0 || includesNow)
        .sort((a, b) => a.units - b.units || a.revenue - b.revenue || a.name.localeCompare(b.name));
      return { machine, list };
    })
    .filter(({ list }) => list.length > 0);
}

export function LeastPerMachineList({ perMachine, m, f }: { perMachine: MachineDishes[]; m: Messages; f: Formatters }) {
  if (perMachine.length === 0) return null;
  return (
    <Section title={m.stats.leastPerMachine} hint={m.stats.leastPerMachineHint}>
      <div className="grid gap-4 lg:grid-cols-2">
        {perMachine.map(({ machine, list }) => (
          <div key={machine.id} className="surface-card flex flex-col p-2">
            <div className="flex items-baseline justify-between gap-3 px-3 pb-1 pt-2">
              <h3 className="truncate text-[15px] font-semibold">{machine.name}</h3>
              <span className="tabular shrink-0 text-[13px] text-muted-foreground">{fmt(m.stats.leastDishes, { n: list.length })}</span>
            </div>
            <DishList dishes={list.slice(0, SHOWN)} from={1} m={m} f={f} />
            {list.length > SHOWN && (
              <details className="group">
                <summary className="flex h-11 cursor-pointer list-none items-center gap-1.5 px-3 text-[14px] font-semibold text-muted-foreground [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden="true" />
                  {fmt(m.stats.leastAll, { n: list.length })}
                </summary>
                <DishList dishes={list.slice(SHOWN)} from={SHOWN + 1} m={m} f={f} />
              </details>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

function DishList({ dishes, from, m, f }: { dishes: Dish[]; from: number; m: Messages; f: Formatters }) {
  // An ordered list: the order is the point.
  return (
    <ol className="flex flex-col" start={from}>
      {dishes.map((dish, i) => (
        <li key={dish.id}>
          <ListRow
            leading={
              <span className="flex shrink-0 items-center gap-2.5">
                <span className="tabular-nums w-4 text-center text-[13px] font-semibold text-muted-foreground">{from + i}</span>
                <Avatar>
                  {dish.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mediaUrl(dish.photo)!} alt="" className="max-h-7 max-w-7 object-contain" />
                  ) : dish.name ? (
                    initial(dish.name)
                  ) : (
                    <Link2 />
                  )}
                </Avatar>
              </span>
            }
            title={dish.name}
            subtitle={
              <span className="tabular">
                {dish.units === 0 ? m.stats.leastNothing : plural(dish.units, m.common.unitsOne, m.common.unitsOther)}
              </span>
            }
            value={dish.units === 0 ? undefined : f.euro(dish.revenue)}
          />
        </li>
      ))}
    </ol>
  );
}
