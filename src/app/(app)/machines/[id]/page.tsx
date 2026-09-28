import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardList, LayoutGrid, Pencil } from "lucide-react";
import { FrontView, OWNER_TONES, OwnerLegend, StockLegend } from "@/components/machine/front-view";
import { EmptyState, PageHeader, Panel } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { fmt, weekdayIndex } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import {
  getBusinesses,
  getMachine,
  getMachineStock,
  getMachineSalesSplit,
  getPaymentFeed,
  getPaymentHealth,
  getRefillHistory,
} from "@/lib/data";
import { toFrontRows } from "@/lib/layout";
import { mediaUrl } from "@/lib/media";
import { requireOrgId } from "@/lib/org";
import { MachineDetailsForm } from "./machine-details-form";
import { TerminalPanel } from "./terminal-panel";

const PAYMENT_WINDOW_DAYS = 30;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orgId = await requireOrgId();
  const machine = await getMachine(orgId, id);
  return { title: machine?.name };
}

export default async function MachinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { m, f } = await getI18n();
  const orgId = await requireOrgId();

  const machine = await getMachine(orgId, id);
  if (!machine) notFound();

  const since = new Date(Date.now() - PAYMENT_WINDOW_DAYS * 86_400_000);
  const [slots, businesses, history, health, payments, split] = await Promise.all([
    getMachineStock(orgId, [id]),
    getBusinesses(orgId),
    getRefillHistory(orgId, id),
    getPaymentHealth(orgId, since),
    getPaymentFeed(orgId, id),
    getMachineSalesSplit(orgId, id, since),
  ]);

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
  const totalCapacity = slots.reduce((sum, s) => sum + s.capacity, 0);

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
              <img src={mediaUrl(machine.business_logo_path)!} alt="" className="h-10 w-14 object-contain" />
            )}
            {machine.name}
          </span>
        }
        subtitle={[
          machine.type ? m.machines.types[machine.type] : m.machines.typeNotSet,
          machine.payter_serial_number && `${m.machines.terminal} ${machine.payter_serial_number}`,
        ]
          .filter(Boolean)
          .join(" · ")}
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

      <div className="flex flex-col gap-6">
        {!tracksStock ? (
          <p className="border border-dashed border-input bg-surface p-6 text-sm text-muted-foreground">
            {m.machines.otherTypeHint}
          </p>
        ) : !hasLayout ? (
          <EmptyState
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
          <Panel
            title={m.machines.stock}
            hint={
              counted.length > 0
                ? fmt(m.machines.inMachine, { stock: totalStock, capacity: totalCapacity })
                : m.machines.stockUnknown
            }
          >
            <FrontView rows={toFrontRows(slots, shared ? toneOf : undefined)} />
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
          </Panel>
        )}

        <TerminalPanel machine={machine} health={health.get(id)} payments={payments} split={split} m={m} f={f} />

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title={m.machines.settings}>
            <MachineDetailsForm machine={machine} businesses={businesses} />
          </Panel>

          {tracksStock && (
            <Panel title={m.machines.history}>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">{m.machines.historyEmpty}</p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {history.map((event) => (
                    <li key={`${event.occurred_at}-${event.type}`} className="flex items-baseline justify-between gap-4 py-2.5">
                      <span>
                        <span className="block font-semibold">
                          {m.weekdays[weekdayIndex(event.occurred_at)]} · {f.dateTime(event.occurred_at)}
                        </span>
                        {(event.filled_by || event.refill_sheet_id) && (
                          <span className="text-xs text-muted-foreground">
                            {[event.filled_by, event.refill_sheet_id ? m.machines.viaSheet : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        )}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {event.type === "refill"
                          ? fmt(m.machines.historyItems, { count: event.added })
                          : m.machines.correction}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
