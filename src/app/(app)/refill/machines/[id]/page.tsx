import Link from "next/link";
import { notFound } from "next/navigation";
import { StockLegend } from "@/components/machine/front-view";
import { FrontView } from "@/components/machine/front-view";
import { MachinePhoto } from "@/components/machine/machine-photo";
import { StatusDot } from "@/components/machine/status-badge";
import { PageHeader, Section } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { fmt } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { getLastSales, getMachines, getMachineStock, getOpenRounds } from "@/lib/data";
import { toFrontRows } from "@/lib/layout";
import { requireRefillAccess } from "@/lib/org";
import { bandBg, fillLevel, machineFill, machineTotals, needsAttention } from "@/lib/stock";
import { terminalStatus } from "@/lib/terminal-status";
import { cn } from "@/lib/utils";
import { FillButton } from "./fill-button";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.nav.machines };
}

/**
 * One machine for whoever fills it: how full it is, every slot with its stock,
 * and the button to fill it. Products and pieces only: no prices, no sales
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
  // Opened from the machines page: back goes there, else to the refill page.
  const fromMachines = (await searchParams).from === "machines";
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { m, f } = await getI18n();
  const [machines, slots, lastSales, open] = await Promise.all([
    getMachines(orgId),
    getMachineStock(orgId, [id]),
    getLastSales(orgId),
    getOpenRounds(orgId),
  ]);
  const machine = machines.find((candidate) => candidate.id === id);
  if (!machine) notFound();

  const stocked = slots.filter((slot) => slot.product_id);
  const total = machineTotals(stocked.map((slot) => ({ machine_id: slot.machine_id, stock: slot.stock, capacity: slot.capacity }))).get(id);
  const fill = total ? machineFill(total.stock, total.capacity, total.counted) : null;
  const low = stocked.filter((slot) => needsAttention(fillLevel(slot.stock, slot.capacity))).length;
  const status = terminalStatus(machine.last_connected_at, machine.last_disconnected_at);
  const lastSale = lastSales.get(id) ?? null;
  // Already on a round that is not finished: carry on with that one instead of starting another.
  const round = open.find((candidate) => candidate.machines.some((mc) => mc.id === id && !mc.done)) ?? null;

  return (
    <>
      <PageHeader
        backHref={fromMachines ? "/machines" : "/refill"}
        backLabel={fromMachines ? m.machines.title : m.refill.title}
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
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {round ? (
              <Link href={`/vullen/${round.id}`} className={buttonVariants({ size: "lg" })}>
                {m.refill.toRound}
              </Link>
            ) : (
              <FillButton machineId={id} />
            )}
          </div>
        </div>

        <Section title={m.refill.stockTitle}>
          {stocked.length === 0 ? (
            <p className="px-1 text-sm text-muted-foreground">{m.machines.noLayoutHint}</p>
          ) : (
            <div className="flex flex-col gap-3">
              <FrontView rows={toFrontRows(stocked)} />
              <StockLegend
                labels={{
                  full: m.machines.legendFull,
                  half: m.machines.legendHalf,
                  low: m.machines.legendLow,
                  empty: m.machines.legendEmpty,
                  unknown: m.machines.legendUnknown,
                }}
              />
            </div>
          )}
        </Section>
      </div>
    </>
  );
}
