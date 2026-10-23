import Link from "next/link";
import { notFound } from "next/navigation";
import { MachinePhoto } from "@/components/machine/machine-photo";
import { StockAdjust } from "@/components/machine/stock-adjust";
import { StatusDot } from "@/components/machine/status-badge";
import { PageHeader, Section } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { fmt } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { getDishes, getLastSales, getMachines, getMachineStock, getOpenRounds, getRefillPlan } from "@/lib/data";
import { requireRefillAccess } from "@/lib/org";
import { lineTake } from "@/lib/refill-flow";
import { filledOnOpenRound, heldByOpenRound } from "@/lib/refill-start";
import { bandBg, fillLevel, machineFill, machineTotals, needsAttention } from "@/lib/stock";
import { terminalStatus } from "@/lib/terminal-status";
import { cn } from "@/lib/utils";
import { FillList, type FillItem } from "./fill-list";
import { LayoutEditor } from "./layout-editor";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.nav.machines };
}

/**
 * One machine for whoever fills it: how full it is, every slot with its stock,
 * and its own vullijst to fill it from. Products and pieces only: no prices, no sales
 * figures, no money (the stock comes without prices for a filler).
 */
export default async function FillMachinePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const orgId = await requireRefillAccess();
  const { id } = await params;
  // Opened from the machines page or (the owner) from the machine's own page: back goes there, else to the refill page.
  const from = (await searchParams).from;
  const fromMachines = from === "machines";
  const fromMachine = from === "machine";
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { m, f } = await getI18n();
  const [machines, slots, lastSales, open, dishes, plan] = await Promise.all([
    getMachines(orgId),
    getMachineStock(orgId, [id]),
    getLastSales(orgId),
    getOpenRounds(orgId),
    // Null for a shared machine: its layout stays the operator's.
    getDishes(orgId, id).catch(() => null),
    // What it misses, as the vullijst and a round count it.
    getRefillPlan(orgId, [id]),
  ]);
  const machine = machines.find((candidate) => candidate.id === id);
  if (!machine) notFound();

  const stocked = slots.filter((slot) => slot.product_id);
  const total = machineTotals(stocked.map((slot) => ({ machine_id: slot.machine_id, stock: slot.stock, capacity: slot.capacity }))).get(id);
  const fill = total ? machineFill(total.stock, total.capacity, total.counted) : null;
  const low = stocked.filter((slot) => needsAttention(fillLevel(slot.stock, slot.capacity))).length;
  const status = terminalStatus(machine.last_connected_at, machine.last_disconnected_at);
  const lastSale = lastSales.get(id) ?? null;
  // Already on a round that is not finished: carry on with that one instead of starting another. Also once
  // filled on it: it counts as filled only when that round is completed (21-10-2026), and a second round would fill it twice.
  const round = open.find((candidate) => heldByOpenRound([candidate]).has(id)) ?? null;
  const filledOnRound = filledOnOpenRound(open).has(id);
  // One line per product, in the order its first slot comes in the machine, as in the vullijst.
  const items = new Map<string, FillItem>();
  for (const line of plan
    .filter((l) => l.machine_id === id && lineTake(l) > 0)
    .sort((a, b) => a.row_position - b.row_position || a.slot_position - b.slot_position)) {
    const item = items.get(line.product_id) ?? { productId: line.product_id, name: line.product_name, photoPath: line.photo_path, take: 0, slots: [] };
    item.take += lineTake(line);
    item.slots.push({ selection: line.selection_number, take: lineTake(line) });
    items.set(line.product_id, item);
  }

  return (
    <>
      <PageHeader
        backHref={fromMachine ? `/machines/${id}` : fromMachines ? "/machines" : "/refill"}
        backLabel={fromMachine ? machine.name : fromMachines ? m.machines.title : m.refill.title}
        title={machine.name}
      />
      <div className="flex flex-col gap-8">
        <div className="grid gap-4 sm:grid-cols-[260px_1fr] sm:items-center">
          <MachinePhoto path={machine.photo_path} className="rounded-2xl" />
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <span
                className={cn(
                  "tabular rounded-full px-3 py-1.5 text-[17px] font-bold",
                  fill ? cn(bandBg[fill.band], "text-white") : "bg-surface text-muted-foreground",
                )}
              >
                {fill ? fmt(m.round.fillLeft, { n: fill.percent }) : m.round.fillUnknown}
              </span>
              <span className="flex items-center gap-1.5 text-[14px] font-medium text-muted-foreground">
                <StatusDot status={status} />
                {status === "online" ? m.round.online : status === "offline" ? m.round.offline : m.round.unknownStatus}
              </span>
            </div>
            <p className="text-[14.5px] text-muted-foreground">
              {[
                total?.counted ? fmt(m.refill.piecesIn, { n: total.stock, cap: total.capacity }) : null,
                low > 0 ? fmt(m.overview.slotsLow, { count: low }) : null,
                lastSale ? fmt(m.round.lastSale, { when: f.dateTime(lastSale) }) : null,
                filledOnRound ? m.refill.filledOnRound : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {round ? (
              <Link href={`/vullen/${round.id}`} className={buttonVariants({ size: "lg" })}>
                {m.refill.toRound}
              </Link>
            ) : (
              // A machine without a layout has nothing to fill yet (Xin, 22-10-2026: a list instead of a round).
              stocked.length > 0 && <FillList machineId={id} items={[...items.values()]} />
            )}
          </div>
        </div>

        {/* The slots, with one button to set their counts with a big minus and plus (Xin, 17-10-2026). */}
        {stocked.length === 0 ? (
          <Section title={m.refill.stockTitle}>
            <p className="px-1 text-sm text-muted-foreground">{m.machines.noLayoutHint}</p>
          </Section>
        ) : (
          <StockAdjust machineId={id} slots={stocked} terminal={status} />
        )}

        {/* The layout itself, simply: a product per slot, the numbers, how many slots a row has (Xin, 17-10-2026). */}
        {dishes && slots.length > 0 && <LayoutEditor machineId={id} slots={slots} dishes={dishes} />}
      </div>
    </>
  );
}
