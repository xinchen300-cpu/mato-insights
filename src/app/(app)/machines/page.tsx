import Link from "next/link";
import { Store } from "lucide-react";
import { StatusBadge } from "@/components/machine/status-badge";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmt, plural } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { getBusinesses, getLastSales, getMachines, getMachineStock, getRoundSettings, rentsToBusinesses } from "@/lib/data";
import { isFiller, isOperator, requireOrgId, requireRefillAccess } from "@/lib/org";
import { orderByRoute } from "@/lib/round-settings";
import { MachineOrder } from "@/components/machine/machine-order";
import { bandBg, fillLevel, machineFill, needsAttention } from "@/lib/stock";
import { terminalStatus } from "@/lib/terminal-status";
import { MachinePhoto } from "@/components/machine/machine-photo";
import { MachineGrid, gridMachines } from "@/components/filler/machine-grid";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.machines.title };
}

/**
 * A filler's machines: the same tiles as on their refill page, in the owner's
 * route order, and also those still waiting for a layout. No businesses and no
 * sales; a tap opens the machine to fill.
 */
async function FillerMachines({ orgId }: { orgId: string }) {
  const { m } = await getI18n();
  const [fleet, slots, settings] = await Promise.all([getMachines(orgId), getMachineStock(orgId), getRoundSettings(orgId)]);
  const grid = gridMachines(fleet, slots, settings.route, { withoutLayout: true });
  return (
    <>
      <PageHeader title={m.machines.title} />
      {/* Held and slid into another order, the order of the route (Xin, 17-10-2026). */}
      <MachineOrder machines={grid.map(({ id, name, photoPath }) => ({ id, name, photoPath }))}>
        <MachineGrid machines={grid} m={m} from="machines" />
      </MachineOrder>
    </>
  );
}

export default async function MachinesPage() {
  if (await isFiller()) {
    const fillerOrg = await requireRefillAccess();
    return <FillerMachines orgId={fillerOrg} />;
  }
  const { m, f } = await getI18n();
  const orgId = await requireOrgId();
  // The operator's machines follow the route, the same order as the filler's tiles and the rounds.
  const operator = await isOperator();
  const [machines, stock, lastSales, businesses, rents, route] = await Promise.all([
    getMachines(orgId),
    getMachineStock(orgId),
    getLastSales(orgId),
    getBusinesses(orgId),
    rentsToBusinesses(orgId),
    operator ? getRoundSettings(orgId).then((settings) => settings.route) : Promise.resolve(null),
  ]);

  const statusLabel = (mc: (typeof machines)[number]) => {
    const status = terminalStatus(mc.last_connected_at, mc.last_disconnected_at);
    return status === "online"
      ? m.status.online
      : status === "offline"
        ? fmt(m.status.offlineSince, { when: f.relative(mc.last_disconnected_at!) })
        : m.status.unknown;
  };

  // Every business a machine sells for — two on a shared machine.
  const nameOf = new Map(businesses.map((b) => [b.id, b.name]));
  const ownerNames = new Map(
    machines.map((mc) => [
      mc.id,
      [mc.business_id, mc.shared_business_id].flatMap((id) => (id && nameOf.has(id) ? [nameOf.get(id)!] : [])),
    ]),
  );

  const summary = new Map<string, { stock: number; capacity: number; low: number; slots: number; counted: boolean }>();
  for (const slot of stock) {
    const s = summary.get(slot.machine_id) ?? { stock: 0, capacity: 0, low: 0, slots: 0, counted: false };
    s.slots += 1;
    // A slot with no count — never counted, or a co-tenant's on a shared
    // fridge — belongs to neither side of the sum, or a full machine reads as
    // half empty.
    if (slot.stock !== null) {
      s.capacity += slot.capacity;
      s.stock += slot.stock;
      s.counted = true;
    }
    if (slot.product_id && needsAttention(fillLevel(slot.stock, slot.capacity))) s.low += 1;
    summary.set(slot.machine_id, s);
  }

  const shown = route ? orderByRoute(machines.map((mc) => mc.id), route).map((id) => machines.find((mc) => mc.id === id)!) : machines;

  return (
    <>
      <PageHeader
        title={m.machines.title}
        actions={
          // Businesses are an automatenshop's: a zaak runs its own machines.
          rents ? (
            <Link href="/businesses" className={buttonVariants({ variant: "outline" })}>
              <Store />
              {m.nav.businesses}
            </Link>
          ) : undefined
        }
      />

      {/* The machines as photo tiles (Xin, 14-10-2026): the picture to
          recognise it by, its name and place, how full it is as one number,
          and only a problem gets words. A tap always opens the machine: what
          it still lacks (a layout, a first count) is done from there. */}
      {machines.length > 0 && (
        <OperatorOrder machines={shown} operator={operator}>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
            {shown.map((mc) => {
              const s = summary.get(mc.id);
              const lastSale = lastSales.get(mc.id);
              const status = terminalStatus(mc.last_connected_at, mc.last_disconnected_at);
              const tracked = Boolean(s && s.slots > 0 && mc.type !== "other");
              const fill = tracked && s ? machineFill(s.stock, s.capacity, s.counted) : null;
              // One line under the name: red when slots run low, grey for what is
              // missing, otherwise the last sale.
              const tracksStock = mc.type !== "other";
              const line =
                tracksStock && s && s.low > 0
                  ? { text: plural(s.low, m.overview.slotsLowOne, m.overview.slotsLow), alert: true }
                  : tracksStock && (!s || s.slots === 0)
                    ? { text: m.machines.noLayout, alert: false }
                    : tracksStock && s && !s.counted
                      ? { text: m.machines.stockUnknown, alert: false }
                      : { text: `${m.machines.lastSale}: ${lastSale ? f.relative(lastSale) : m.machines.noSales}`, alert: false };
              const place =
                (ownerNames.get(mc.id) ?? []).filter((name) => name !== mc.name).join(" · ") ||
                (mc.type ? m.machines.types[mc.type] : null);
              return (
                <li key={mc.id}>
                  <Link
                    href={`/machines/${mc.id}`}
                    className="group block h-full overflow-hidden rounded-2xl bg-card shadow-[0_0_0_1px_var(--border),0_1px_2px_rgb(0_0_0/0.04)] transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_var(--border),0_12px_28px_-14px_rgb(0_0_0/0.28)] focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:outline-none"
                  >
                    <MachinePhoto path={mc.photo_path}>
                      {/* Online is a breathing dot; anything else also says what is wrong. */}
                      <span className="absolute top-2.5 left-2.5 inline-flex max-w-[calc(100%-5.5rem)] items-center rounded-full bg-card/92 px-2 py-1 shadow-sm backdrop-blur">
                        {/* The full "offline since …" is the tooltip; on a tile one word is enough. */}
                        <span title={statusLabel(mc)} className="inline-flex">
                          <StatusBadge
                            status={status}
                            label={status === "offline" ? m.status.offline : statusLabel(mc)}
                            hideLabel={status !== "offline"}
                            className="text-[12px]"
                          />
                        </span>
                      </span>
                      {/* How full, as one number; a machine never counted shows none. */}
                      {fill && (
                        <span
                          className={cn(
                            "tabular absolute top-2.5 right-2.5 rounded-full px-2.5 py-1 text-[13px] font-semibold text-white shadow-sm",
                            bandBg[fill.band],
                          )}
                          title={fmt(m.machines.inMachine, { stock: s!.stock, capacity: s!.capacity })}
                        >
                          {fill.percent}%
                        </span>
                      )}
                    </MachinePhoto>

                    <span className="block px-3.5 pt-3 pb-3.5">
                      <span className="block truncate text-[15px] font-semibold tracking-[-0.01em]">{mc.name}</span>
                      {place && <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{place}</span>}
                      <span
                        className={cn(
                          "mt-2 line-clamp-2 block text-[12.5px] leading-snug",
                          line.alert ? "font-medium text-negative" : "text-muted-foreground",
                        )}
                      >
                        {line.text}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </OperatorOrder>
      )}
    </>
  );
}

/** The order button around the tiles, for the operator only: a shop does not set the fleet's route. */
function OperatorOrder({
  machines,
  operator,
  children,
}: {
  machines: { id: string; name: string; photo_path: string | null }[];
  operator: boolean;
  children: React.ReactNode;
}) {
  if (!operator) return children;
  return <MachineOrder machines={machines.map((mc) => ({ id: mc.id, name: mc.name, photoPath: mc.photo_path }))}>{children}</MachineOrder>;
}
