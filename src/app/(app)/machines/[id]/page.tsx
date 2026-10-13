import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardList, LayoutGrid, Pencil } from "lucide-react";
import { Avatar, RowList } from "@/components/list-row";
import { OWNER_TONES, OwnerLegend, StockLegend, type FrontSlot } from "@/components/machine/front-view";
import { SlotProducts } from "@/components/machine/slot-products";
import { EmptyState, PageHeader, Section } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { DISPLAY_TIME_ZONE, fmt, weekdayIndex } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import {
  getBusinesses,
  getMachine,
  getMachineStock,
  getMachineSalesSplit,
  getPaymentFeed,
  getPaymentHealth,
  getProducts,
  getRefillHistory,
  getSlotShelfLife,
} from "@/lib/data";
import { toFrontRows } from "@/lib/layout";
import { mediaUrl } from "@/lib/media";
import { denyFiller, requireOrgId } from "@/lib/org";
import { fillLevel, levelColor } from "@/lib/stock";
import { cn } from "@/lib/utils";
import { assignProduct, createProductForMachine } from "../actions";
import { MachineDetailsForm } from "./machine-details-form";
import { MachineStatus, TerminalPanel } from "./terminal-panel";

const PAYMENT_WINDOW_DAYS = 30;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  await denyFiller();
  const { id } = await params;
  const orgId = await requireOrgId();
  const machine = await getMachine(orgId, id);
  return { title: machine?.name };
}

export default async function MachinePage({ params }: { params: Promise<{ id: string }> }) {
  await denyFiller();
  const { id } = await params;
  const { m, f } = await getI18n();
  const orgId = await requireOrgId();

  const machine = await getMachine(orgId, id);
  if (!machine) notFound();

  const since = new Date(Date.now() - PAYMENT_WINDOW_DAYS * 86_400_000);
  const [slots, businesses, history, health, payments, split, products, shelfLife] = await Promise.all([
    getMachineStock(orgId, [id]),
    getBusinesses(orgId),
    getRefillHistory(orgId, id),
    getPaymentHealth(orgId, since),
    getPaymentFeed(orgId, id),
    getMachineSalesSplit(orgId, id, since),
    getProducts(orgId),
    getSlotShelfLife(orgId, id),
  ]);

  // How long what is in each slot still keeps, counted in Belgian days.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: DISPLAY_TIME_ZONE }).format(new Date());
  const daysUntil = (date: string) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  const decorate = (slot: FrontSlot): FrontSlot => {
    const life = shelfLife.get(slot.selection);
    const days = life?.nextExpiresAt ? daysUntil(life.nextExpiresAt) : null;
    const badge: FrontSlot["badge"] =
      life && life.expired > 0
        ? { text: fmt(m.machines.shelfExpired, { n: life.expired }), tone: "negative" }
        : days === null
          ? null
          : days <= 0
            ? { text: m.machines.shelfToday, tone: "warning" }
            : days === 1
              ? { text: m.machines.shelfTomorrow, tone: "warning" }
              : { text: fmt(m.machines.shelfDays, { n: days }), tone: "muted" };
    const keeps =
      life && life.expired > 0
        ? fmt(m.machines.shelfExpired, { n: life.expired })
        : days === null
          ? null
          : days <= 0
            ? m.machines.shelfLongToday
            : days === 1
              ? m.machines.shelfLongTomorrow
              : fmt(m.machines.shelfLongDays, { n: days });
    const stock = slot.stock === null ? m.machines.stockUnknownShort : fmt(m.machines.stockNow, { n: slot.stock, cap: slot.capacity });
    return { ...slot, badge, info: [keeps, slot.productName ? stock : null].filter(Boolean).join(" · ") || null };
  };

  // A shared machine: every slot belongs to one of its two businesses.
  const shared = Boolean(machine.shared_business_id);
  const ownerIds = [machine.business_id, machine.shared_business_id].filter((id): id is string => Boolean(id));
  const owners = ownerIds.map((ownerId, i) => ({
    id: ownerId,
    name: businesses.find((b) => b.id === ownerId)?.name ?? "—",
    tone: OWNER_TONES[i % OWNER_TONES.length],
  }));
  const toneOf = (businessId: string | null) => owners.find((o) => o.id === businessId)?.tone ?? null;

  const hasLayout = slots.length > 0;
  const tracksStock = machine.type !== "other";
  const counted = slots.filter((s) => s.stock !== null);
  const totalStock = counted.reduce((sum, s) => sum + (s.stock ?? 0), 0);
  // Only the slots that carry a count, so the fill level matches its numerator.
  const totalCapacity = counted.reduce((sum, s) => sum + s.capacity, 0);

  return (
    <>
      <PageHeader
        backHref="/machines"
        backLabel={m.nav.machines}
        eyebrow={
          shared
            ? owners.map((o) => o.name).join(" · ")
            : machine.business_name && machine.business_name !== machine.name
              ? machine.business_name
              : undefined
        }
        title={
          <span className="flex items-center gap-3">
            {machine.business_logo_path && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaUrl(machine.business_logo_path)!} alt="" className="h-9 w-12 object-contain" />
            )}
            {machine.name}
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              {[
                machine.type ? m.machines.types[machine.type] : m.machines.typeNotSet,
                machine.payter_serial_number && `${m.machines.terminal} ${machine.payter_serial_number}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
            <MachineStatus machine={machine} m={m} className="text-[14px]" />
          </span>
        }
        actions={
          <>
            {hasLayout && tracksStock && (
              <>
                <Link href={`/machines/${id}/refill`} className={buttonVariants()}>
                  <ClipboardList />
                  {m.machines.refill}
                </Link>
                <Link href={`/machines/${id}/refill?mode=correction`} className={buttonVariants({ variant: "outline" })}>
                  <Pencil />
                  {m.machines.correct}
                </Link>
              </>
            )}
            {tracksStock && (
              <Link href={`/machines/${id}/layout`} className={buttonVariants({ variant: "outline" })}>
                <LayoutGrid />
                {m.machines.layout}
              </Link>
            )}
          </>
        }
      />

      <div className="flex flex-col gap-10">
        {!tracksStock ? (
          <p className="rounded-2xl bg-surface px-5 py-4 text-[14px] text-muted-foreground sm:px-6">
            {m.machines.otherTypeHint}
          </p>
        ) : !hasLayout ? (
          <EmptyState
            icon={<LayoutGrid className="size-5" />}
            title={m.machines.noLayout}
            hint={m.machines.noLayoutHint}
            action={
              <Link href={`/machines/${id}/layout`} className={buttonVariants()}>
                <LayoutGrid />
                {m.machines.buildLayout}
              </Link>
            }
          />
        ) : (
          // The balance of a machine is what is in it: the count, big, then the machine itself.
          <section className="surface-card px-5 pb-5 pt-6 sm:px-8 sm:pb-7 sm:pt-8">
            <h2 className="text-[14px] font-medium tracking-normal text-muted-foreground">{m.machines.stock}</h2>
            {counted.length > 0 ? (
              <>
                <p className="mt-2 text-[40px] font-semibold leading-none tracking-[-0.04em] tabular-nums sm:text-[48px]">
                  {totalStock}
                  <span className="text-[22px] font-medium tracking-[-0.02em] text-muted-foreground sm:text-[26px]">
                    {" "}
                    / {totalCapacity}
                  </span>
                </p>
                <div className="mt-4 h-1.5 max-w-sm overflow-hidden rounded-full bg-level-empty">
                  <div
                    className={cn("h-full rounded-full", levelColor[fillLevel(totalStock, totalCapacity)])}
                    style={{ width: `${totalCapacity > 0 ? Math.min(100, (totalStock / totalCapacity) * 100) : 0}%` }}
                  />
                </div>
                <p className="mt-2.5 text-[13.5px] text-muted-foreground">
                  {fmt(m.machines.inMachine, { stock: totalStock, capacity: totalCapacity })}
                </p>
              </>
            ) : (
              <p className="mt-2 text-[24px] font-semibold tracking-[-0.03em] text-muted-foreground">
                {m.machines.stockUnknown}
              </p>
            )}

            <div className="mt-7 sm:mt-8">
              <SlotProducts
                rows={toFrontRows(slots, shared ? toneOf : undefined).map((row) => row.map(decorate))}
                products={products}
                onAssign={assignProduct.bind(null, id)}
                onCreate={createProductForMachine.bind(null, id)}
              />
            </div>
            <div className="mt-4 flex flex-col gap-2">
              {shared && <OwnerLegend owners={owners} />}
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
          </section>
        )}

        <TerminalPanel machine={machine} health={health.get(id)} payments={payments} split={split} m={m} f={f} />

        {tracksStock && (
          <Section title={m.machines.history}>
            {history.length === 0 ? (
              <p className="surface-card px-5 py-4 text-[14px] text-muted-foreground">{m.machines.historyEmpty}</p>
            ) : (
              <RowList>
                {history.map((event) => (
                  <li
                    key={`${event.occurred_at}-${event.type}`}
                    className="flex min-h-14 items-center gap-3.5 rounded-xl px-3 py-2.5"
                  >
                    <Avatar>{event.type === "refill" ? <ClipboardList /> : <Pencil />}</Avatar>
                    {/* Phones read the event under the date; wider screens put it on the right. */}
                    <div className="min-w-0 flex-1 sm:flex sm:items-center sm:justify-between sm:gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-semibold tracking-[-0.01em]">
                          {m.weekdays[weekdayIndex(event.occurred_at)]} · {f.dateTime(event.occurred_at)}
                        </p>
                        {(event.filled_by || event.refill_sheet_id) && (
                          <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                            {[event.filled_by, event.refill_sheet_id ? m.machines.viaSheet : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                      </div>
                      <p className="mt-0.5 text-[13px] text-muted-foreground sm:mt-0 sm:shrink-0 sm:text-right">
                        {event.type === "refill"
                          ? fmt(m.machines.historyItems, { count: event.added })
                          : m.machines.correction}
                      </p>
                    </div>
                  </li>
                ))}
              </RowList>
            )}
          </Section>
        )}

        <Section title={m.machines.settings}>
          <div className="surface-card p-5 sm:p-6">
            <MachineDetailsForm machine={machine} businesses={businesses} />
          </div>
        </Section>
      </div>
    </>
  );
}
