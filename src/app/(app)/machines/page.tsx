import Link from "next/link";
import { ArrowRight, ChevronRight, Store } from "lucide-react";
import { Avatar, RowList } from "@/components/list-row";
import { StatusBadge } from "@/components/machine/status-badge";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmt } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { canEditLayout, getBusinesses, getLastSales, getMachines, getMachineStock } from "@/lib/data";
import { mediaUrl } from "@/lib/media";
import { denyFiller, requireOrgId } from "@/lib/org";
import { fillLevel, levelColor, needsAttention } from "@/lib/stock";
import { terminalStatus } from "@/lib/terminal-status";
import { MachineIcon } from "@/components/machine/machine-icon";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.machines.title };
}

export default async function MachinesPage() {
  await denyFiller();
  const { m, f } = await getI18n();
  const orgId = await requireOrgId();
  const [machines, stock, lastSales, businesses] = await Promise.all([
    getMachines(orgId),
    getMachineStock(orgId),
    getLastSales(orgId),
    getBusinesses(orgId),
  ]);
  // Whether each machine's layout is the caller's to draw: not a shared one, for a shop.
  const drawable = await Promise.all(machines.map(canEditLayout));

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

  return (
    <>
      <PageHeader
        title={m.machines.title}
        actions={
          <Link href="/businesses" className={buttonVariants({ variant: "outline" })}>
            <Store />
            {m.nav.businesses}
          </Link>
        }
      />

      {/* The machines as a bank shows its accounts: one calm row each, the
          name on the left, how full it is on the right. */}
      {machines.length > 0 && (
        <RowList>
          {machines.map((mc, i) => {
            const s = summary.get(mc.id);
            const lastSale = lastSales.get(mc.id);
            const overall = s && s.counted ? fillLevel(s.stock, s.capacity) : "unknown";
            // Online is the normal case and goes unsaid; only a problem gets a word.
            const status = terminalStatus(mc.last_connected_at, mc.last_disconnected_at);
            // A row that is missing something points straight at the screen that fixes it.
            const todo =
              mc.type === "other"
                ? null
                : !s || s.slots === 0
                  ? drawable[i]
                    ? { label: m.machines.buildLayout, href: `/machines/${mc.id}/layout` }
                    : null
                  : !s.counted
                    ? { label: m.machines.countStock, href: `/machines/${mc.id}/refill` }
                    : null;
            const subline = [
              (ownerNames.get(mc.id) ?? []).filter((name) => name !== mc.name).join(" · ") || null,
              mc.type ? m.machines.types[mc.type] : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={mc.id}>
                {/* Phones stack the stock under the name; wider screens give it its own column. */}
                <Link
                  href={todo?.href ?? `/machines/${mc.id}`}
                  className="hover-surface grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-2.5 rounded-xl px-3 py-3.5 sm:grid-cols-[auto_minmax(0,1fr)_14rem_auto] sm:gap-x-6"
                >
                  <Avatar
                    className={cn(
                      "col-start-1 row-span-2 row-start-1 self-start sm:row-span-1 sm:self-center",
                      mc.business_logo_path && "bg-card shadow-[0_0_0_1px_var(--border)]",
                    )}
                  >
                    {mc.business_logo_path ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={mediaUrl(mc.business_logo_path)!} alt="" className="max-h-6 max-w-7 object-contain" />
                    ) : (
                      <MachineIcon />
                    )}
                  </Avatar>

                  <span className="col-start-2 row-start-1 min-w-0">
                    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                      <span className="max-w-full truncate text-[15px] font-semibold tracking-[-0.01em]">
                        {mc.name}
                      </span>
                      {/* Online is a breathing green dot; anything else also says what is wrong. */}
                      <StatusBadge
                        status={status}
                        label={statusLabel(mc)}
                        hideLabel={status === "online"}
                        className="shrink-0"
                      />
                    </span>
                    {subline && (
                      <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{subline}</span>
                    )}
                    <span className="mt-0.5 block truncate text-[12.5px] text-muted-foreground">
                      {m.machines.lastSale}: {lastSale ? f.relative(lastSale) : m.machines.noSales}
                    </span>
                  </span>

                  <span className="col-start-2 row-start-2 flex min-w-0 items-center gap-3 sm:col-start-3 sm:row-start-1 sm:flex-col sm:items-end sm:gap-2 sm:text-right">
                    {s && s.slots > 0 && mc.type !== "other" ? (
                      <>
                        {s.counted && (
                          <span className="block h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-level-empty sm:w-full">
                            <span
                              className={cn("block h-full rounded-full", levelColor[overall])}
                              style={{ width: `${Math.min(100, (s.stock / s.capacity) * 100)}%` }}
                            />
                          </span>
                        )}
                        {todo ? (
                          <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-foreground">
                            {todo.label}
                            <ArrowRight className="size-3.5" />
                          </span>
                        ) : (
                          <span
                            className={cn(
                              "text-[13px]",
                              s.low > 0 ? "font-medium text-negative" : "text-muted-foreground",
                            )}
                          >
                            {s.low > 0
                              ? fmt(m.overview.slotsLow, { count: s.low })
                              : fmt(m.machines.inMachine, { stock: s.stock, capacity: s.capacity })}
                          </span>
                        )}
                      </>
                    ) : mc.type === "other" ? (
                      <span className="text-[13px] text-muted-foreground">{m.machines.types.other}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-foreground">
                        {m.machines.buildLayout}
                        <ArrowRight className="size-3.5" />
                      </span>
                    )}
                  </span>

                  <ChevronRight
                    className="col-start-3 row-span-2 row-start-1 size-4 shrink-0 text-muted-foreground/70 sm:col-start-4 sm:row-span-1"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            );
          })}
        </RowList>
      )}
    </>
  );
}
