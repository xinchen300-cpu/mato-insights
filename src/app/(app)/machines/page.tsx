import Link from "next/link";
import { ArrowRight, Store } from "lucide-react";
import { StatusBadge } from "@/components/machine/status-badge";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmt } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { getBusinesses, getLastSales, getMachines, getMachineStock } from "@/lib/data";
import { mediaUrl } from "@/lib/media";
import { requireOrgId } from "@/lib/org";
import { fillLevel, levelColor, needsAttention } from "@/lib/stock";
import { terminalStatus } from "@/lib/terminal-status";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.machines.title };
}

export default async function MachinesPage() {
  const { m, f } = await getI18n();
  const orgId = await requireOrgId();
  const [machines, stock, lastSales, businesses] = await Promise.all([
    getMachines(orgId),
    getMachineStock(orgId),
    getLastSales(orgId),
    getBusinesses(orgId),
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

  return (
    <>
      <PageHeader
        title={m.machines.title}
        subtitle={m.machines.subtitle}
        actions={
          <Link href="/businesses" className={buttonVariants({ variant: "outline" })}>
            <Store />
            {m.nav.businesses}
          </Link>
        }
      />

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {machines.map((mc) => {
          const s = summary.get(mc.id);
          const lastSale = lastSales.get(mc.id);
          const overall = s && s.counted ? fillLevel(s.stock, s.capacity) : "unknown";
          // Online is the normal case and goes unsaid; only a problem gets a word.
          const status = terminalStatus(mc.last_connected_at, mc.last_disconnected_at);
          // A card that is missing something points straight at the screen that fixes it.
          const todo =
            mc.type === "other"
              ? null
              : !s || s.slots === 0
                ? { label: m.machines.buildLayout, href: `/machines/${mc.id}/layout` }
                : !s.counted
                  ? { label: m.machines.countStock, href: `/machines/${mc.id}/refill` }
                  : null;
          return (
            <li key={mc.id}>
              <Link
                href={todo?.href ?? `/machines/${mc.id}`}
                className="flex h-full flex-col gap-3 border bg-card p-5 transition-colors hover:border-primary/40"
              >
                <div className="flex items-start gap-3">
                  {mc.business_logo_path && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mediaUrl(mc.business_logo_path)!} alt="" className="h-9 w-12 object-contain" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate font-heading text-lg font-semibold text-foreground">{mc.name}</p>
                      {status !== "online" && (
                        <StatusBadge status={status} label={statusLabel(mc)} className="shrink-0" />
                      )}
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {[
                        (ownerNames.get(mc.id) ?? []).filter((name) => name !== mc.name).join(" · ") || null,
                        mc.type ? m.machines.types[mc.type] : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </div>

                {s && s.slots > 0 && mc.type !== "other" ? (
                  <div className="flex flex-col gap-1.5">
                    {s.counted && (
                      <div className="h-1.5 bg-level-empty/60">
                        <div
                          className={cn("h-full", levelColor[overall])}
                          style={{ width: `${Math.min(100, (s.stock / s.capacity) * 100)}%` }}
                        />
                      </div>
                    )}
                    {todo ? (
                      <p className="inline-flex items-center gap-1 text-sm font-semibold text-accent-foreground">
                        {todo.label}
                        <ArrowRight className="size-3.5" />
                      </p>
                    ) : (
                      <p className={cn("text-sm", s.low > 0 ? "text-negative" : "text-muted-foreground")}>
                        {s.low > 0
                          ? fmt(m.overview.slotsLow, { count: s.low })
                          : fmt(m.machines.inMachine, { stock: s.stock, capacity: s.capacity })}
                      </p>
                    )}
                  </div>
                ) : mc.type === "other" ? (
                  <p className="text-sm text-muted-foreground">{m.machines.types.other}</p>
                ) : (
                  <p className="inline-flex items-center gap-1 text-sm font-semibold text-accent-foreground">
                    {m.machines.buildLayout}
                    <ArrowRight className="size-3.5" />
                  </p>
                )}

                <p className="mt-auto text-xs text-muted-foreground">
                  {m.machines.lastSale}: {lastSale ? f.relative(lastSale) : m.machines.noSales}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
