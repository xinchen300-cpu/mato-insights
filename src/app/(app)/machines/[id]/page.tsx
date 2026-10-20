import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronDown, ClipboardList, LayoutGrid, Pencil } from "lucide-react";
import { KpiHero } from "@/components/kpi";
import { Avatar, ListRow, RowList, initial } from "@/components/list-row";
import { OWNER_TONES, OwnerLegend, StockLegend, type FrontSlot } from "@/components/machine/front-view";
import { SlotProducts } from "@/components/machine/slot-products";
import { EmptyState, PageHeader, Section } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { DISPLAY_TIME_ZONE, fmt, plural, weekdayIndex } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import {
  canEditLayout,
  getOwnSelections,
  getBusinesses,
  rentsToBusinesses,
  getMachine,
  getMachineStock,
  getMachineSalesSplit,
  getPaymentFeed,
  getPaymentHealth,
  getProducts,
  getRefillHistory,
  getSlotShelfLife,
  getStatsReport,
  getMachineCamera,
} from "@/lib/data";
import { toFrontRows } from "@/lib/layout";
import { mediaUrl } from "@/lib/media";
import { denyFiller, isOperator, requireOrgId } from "@/lib/org";
import { compareMoneySince } from "@/lib/stats";
import { fillLevel, levelColor } from "@/lib/stock";
import { camerasEnabled } from "@/lib/unifi";
import { cn } from "@/lib/utils";
import { assignProduct, createProductForMachine } from "../actions";
import { MachineCamera } from "./machine-camera";
import { MachineCameraForm } from "./machine-camera-form";
import { MachineDetailsForm } from "./machine-details-form";
import { MachinePhotoForm } from "./machine-photo-form";
import { MachineStatus, TerminalPanel } from "./terminal-panel";
import { AutoRefresh } from "@/components/auto-refresh";

const PAYMENT_WINDOW_DAYS = 30;
/** The latest refills on the machine's page. */
const HISTORY_ROWS = 5;

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
  const [slots, businesses, history, health, payments, month, products, shelfLife, editLayout, rents] = await Promise.all([
    getMachineStock(orgId, [id]),
    getBusinesses(orgId),
    getRefillHistory(orgId, id),
    getPaymentHealth(orgId, since),
    getPaymentFeed(orgId, id),
    // What the machine brought in this month; for a shop, its own slots only (data.ts).
    getStatsReport(orgId, { period: "month", machines: [id] }),
    getProducts(orgId),
    getSlotShelfLife(orgId, id),
    canEditLayout(machine),
    rentsToBusinesses(orgId),
  ]);
  // A shared machine shows this month per business, so the two add up to the figure above.
  const split = machine.shared_business_id ? await getMachineSalesSplit(orgId, id, new Date(month.cur_start)) : [];

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
  const operator = await isOperator();
  // The owner fills and counts on the filler's page, with its big minus and plus (Xin, 20-10-2026); a shop keeps its own form.
  const refillHref = operator ? `/refill/machines/${id}?from=machine` : `/machines/${id}/refill`;
  // The UniFi camera aimed at it, where this organisation has one: the operator's alone (lib/unifi.ts).
  const cameraReady = operator && camerasEnabled(orgId);
  const camera = cameraReady ? await getMachineCamera(orgId, id) : null;
  // On a shared fridge a shop picks products for its own slots only.
  const ownSlots = shared ? await getOwnSelections(orgId, id) : null;
  const ownerIds = [machine.business_id, machine.shared_business_id].filter((id): id is string => Boolean(id));
  const owners = ownerIds.map((ownerId, i) => ({
    id: ownerId,
    name: businesses.find((b) => b.id === ownerId)?.name ?? m.common.unknown,
    tone: OWNER_TONES[i % OWNER_TONES.length],
  }));
  const toneOf = (businessId: string | null) => owners.find((o) => o.id === businessId)?.tone ?? null;

  const hasLayout = slots.length > 0;
  const tracksStock = machine.type !== "other";
  const counted = slots.filter((s) => s.stock !== null);
  const totalStock = counted.reduce((sum, s) => sum + (s.stock ?? 0), 0);
  // Only the slots that carry a count, so the fill level matches its numerator.
  const totalCapacity = counted.reduce((sum, s) => sum + s.capacity, 0);
  // "Not counted" belongs in the legend only while a slot with a product has no count.
  const anyUncounted = slots.some((s) => s.product_id && s.stock === null);
  const recentHistory = history.slice(0, HISTORY_ROWS);
  // Money shown, pieces tested, as on the overview: a mix shift is "about the same".
  const monthVerdict = compareMoneySince(
    month.totals.units,
    month.totals.prev_units,
    month.totals.revenue,
    month.totals.prev_revenue,
    month.first_sale,
    month.prev_start,
  );

  return (
    <>
      <AutoRefresh />
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
        subtitle={<MachineStatus machine={machine} m={m} className="text-[14px]" />}
        actions={
          // One action up here; correcting and the layout sit under the slots they change.
          hasLayout && tracksStock ? (
            <Link href={refillHref} className={buttonVariants()}>
              <ClipboardList />
              {m.machines.refill}
            </Link>
          ) : undefined
        }
      />

      {/* What this machine brings in, then what is in it, then the terminal,
          its payments and refills. Its settings stay folded until needed. */}
      <div className="flex flex-col gap-10">
        <section className="surface-card px-5 pb-5 pt-6 sm:px-8 sm:pb-6 sm:pt-7">
          <KpiHero
            size="md"
            label={m.overview.month}
            value={f.euro(month.totals.revenue)}
            compare={{
              current: month.totals.revenue,
              previous: month.totals.prev_revenue,
              label: m.periods.compareMonth,
              verdict: monthVerdict,
              notes: {
                tooFew: m.stats.tooFewToCompare,
                noise: m.stats.withinNoise,
                same: m.stats.aboutSame,
                new: month.first_sale ? fmt(m.stats.newSince, { date: f.dayMonth(month.first_sale) }) : undefined,
              },
            }}
            detail={plural(month.totals.units, m.common.salesOne, m.common.salesOther)}
            f={f}
          />
          {split.length > 1 && (
            <ul className="-mx-3 mt-5 flex flex-col border-t border-border pt-3">
              {split.map((row) => (
                <li key={row.business_id}>
                  <ListRow
                    leading={<Avatar>{initial(row.business_name)}</Avatar>}
                    title={row.business_name}
                    subtitle={plural(row.units, m.common.salesOne, m.common.salesOther)}
                    value={f.euro(row.revenue)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        {camera && <MachineCamera machineId={id} machineName={machine.name} />}

        {!tracksStock ? (
          <p className="rounded-2xl bg-surface px-5 py-4 text-[14px] text-muted-foreground sm:px-6">
            {m.machines.otherTypeHint}
          </p>
        ) : !hasLayout ? (
          <EmptyState
            icon={<LayoutGrid className="size-5" />}
            title={m.machines.noLayout}
            hint={editLayout ? m.machines.noLayoutHint : m.machines.noLayoutShared}
            action={
              editLayout && (
                <Link href={`/machines/${id}/layout`} className={buttonVariants()}>
                  <LayoutGrid />
                  {m.machines.buildLayout}
                </Link>
              )
            }
          />
        ) : (
          // What is in it: the count, big, then the machine itself.
          <section className="surface-card px-5 pb-5 pt-6 sm:px-8 sm:pb-7 sm:pt-8">
            <h2 className="text-[14px] font-medium tracking-normal text-muted-foreground">{m.machines.stock}</h2>
            {counted.length > 0 ? (
              <>
                <p
                  className="mt-2 text-[40px] font-semibold leading-none tracking-[-0.04em] tabular-nums sm:text-[48px]"
                  title={fmt(m.machines.inMachine, { stock: totalStock, capacity: totalCapacity })}
                >
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
                editable={ownSlots}
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
                  unknown: anyUncounted ? m.machines.legendUnknown : undefined,
                }}
              />
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href={operator ? refillHref : `/machines/${id}/refill?mode=correction`} className={buttonVariants({ variant: "secondary" })}>
                <Pencil />
                {m.machines.correct}
              </Link>
              {editLayout && (
                <Link href={`/machines/${id}/layout`} className={buttonVariants({ variant: "secondary" })}>
                  <LayoutGrid />
                  {m.machines.editLayout}
                </Link>
              )}
            </div>
          </section>
        )}

        <TerminalPanel machine={machine} health={health.get(id)} payments={payments} m={m} f={f} />

        {tracksStock && recentHistory.length > 0 && (
          <Section title={m.machines.history}>
            <RowList>
              {recentHistory.map((event) => (
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
                      {event.filled_by && (
                        <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{event.filled_by}</p>
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
          </Section>
        )}

        {/* A shop renames a machine of its own; a shared fridge's settings are the operator's alone.
            Folded: it is set once and rarely looked at again. */}
        {(operator || !shared) && (
          <details className="group surface-card">
            <summary className="hover-surface flex min-h-16 cursor-pointer list-none items-center gap-3 rounded-[inherit] px-5 py-4 sm:px-6 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 flex-1 text-[16px] font-semibold tracking-[-0.015em]">{m.machines.settings}</span>
              <ChevronDown
                className="size-5 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <div className="flex flex-col gap-8 border-t border-border px-5 pb-6 pt-5 sm:px-6">
              <MachinePhotoForm machineId={machine.id} photoPath={machine.photo_path} />
              {cameraReady && <MachineCameraForm machineId={machine.id} linked={camera} />}
              <MachineDetailsForm machine={machine} businesses={operator ? businesses : []} operator={operator} rentsToBusinesses={rents} />
            </div>
          </details>
        )}
      </div>
    </>
  );
}
