import Link from "next/link";
import { ChevronDown, Link2 } from "lucide-react";
import { MiniStat } from "@/components/kpi";
import { Avatar, ListRow, RowList, initial } from "@/components/list-row";
import { StatusBadge } from "@/components/machine/status-badge";
import { Section } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { fmt, type Formatters } from "@/i18n/format";
import type { Messages } from "@/i18n/messages";
import { shareIsReal } from "@/lib/stats";
import { terminalStatus } from "@/lib/terminal-status";
import { cn } from "@/lib/utils";
import { RecordingLink } from "@/components/recording-link";
import type { LinkedCamera } from "@/lib/camera-link";
import type { Machine, PaymentEntry, PaymentHealth } from "@/lib/types";

// Above this share of payments breaking off, the machine or its connection
// deserves a look; a declined card is usually the customer's bank.
const FAILED_WARNING = 0.02;
/** The latest payments on the machine's page; the rest is one tap away. */
const RECENT_PAYMENTS = 5;

/** The terminal's connection as a dot and a word, for the top of the machine's page. */
export function MachineStatus({ machine, m, className }: { machine: Machine; m: Messages; className?: string }) {
  const status = terminalStatus(machine.last_connected_at, machine.last_disconnected_at);
  return (
    <StatusBadge
      status={status}
      label={status === "offline" ? m.status.offline : status === "online" ? m.status.online : m.status.unknown}
      className={className}
    />
  );
}

/**
 * The payment terminal: the three figures of the last 30 days, a warning only
 * when something is wrong, and the technical details folded away.
 */
export function TerminalPanel({
  machine,
  health,
  payments,
  cameras = [],
  m,
  f,
}: {
  machine: Machine;
  health: PaymentHealth | undefined;
  payments: PaymentEntry[];
  /** Its UniFi cameras, for the operator: each payment opens its recording. */
  cameras?: LinkedCamera[];
  m: Messages;
  f: Formatters;
}) {
  const status = terminalStatus(machine.last_connected_at, machine.last_disconnected_at);
  const since = status === "offline" ? machine.last_disconnected_at : machine.last_connected_at;
  const attempts = health ? health.approved + health.declined + health.failed : 0;
  const failedShare = health && attempts ? health.failed / attempts : 0;
  // One customer walking away mid-tap on a quiet machine is not a broken
  // terminal, but a machine that fails most of its taps is — however few they
  // are. So the same test as everywhere else: the share counts as real when
  // its 95% interval clears the floor, which keeps 1-in-8 quiet and 30-in-34
  // loud.
  const failing = attempts > 0 && shareIsReal(health?.failed ?? 0, attempts, FAILED_WARNING);
  const flagLabels = m.status.flags as Record<string, string>;
  const reasonLabels = m.status.reasons as Record<string, string>;
  const recent = payments.slice(0, RECENT_PAYMENTS);

  return (
    <>
      <Section title={m.status.title}>
        <div className="surface-card flex flex-col gap-5 p-5 sm:p-6">
          {status === "offline" && <p className="text-[15px] font-medium text-negative">{m.status.offlineHint}</p>}

          {/* The last 30 days of payments: three figures, words only when something is off. */}
          <div className="flex flex-col gap-3">
            <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{m.status.payments}</h3>
            {!health || attempts === 0 ? (
              <p className="text-[14px] text-muted-foreground">{m.status.noPayments}</p>
            ) : (
              <>
                <ul className="grid grid-cols-3 gap-4">
                  <li>
                    <MiniStat label={m.status.approved} value={f.number(health.approved)} f={f} />
                  </li>
                  <li>
                    <MiniStat label={m.status.declined} value={f.number(health.declined)} f={f} />
                  </li>
                  <li>
                    <MiniStat
                      label={m.status.failed}
                      value={f.number(health.failed)}
                      f={f}
                      className={failing ? "text-negative" : undefined}
                    />
                  </li>
                </ul>
                {failing && (
                  <p className="text-[14px] font-medium text-negative">
                    {fmt(m.status.failedWarning, { pct: f.percent(failedShare) })}
                  </p>
                )}
              </>
            )}
          </div>

          {/* The connection, the model and what Payter reports, for whoever needs it. */}
          <details className="group -mx-2 -mb-2">
            <summary className="hover-surface flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-2 text-[14px] font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
              {m.status.details}
              <ChevronDown
                className="size-4 shrink-0 transition-transform duration-150 group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <dl className="flex flex-col gap-4 px-2 pb-3 pt-2">
              <div className="flex flex-col gap-1">
                <dt className="text-[13px] text-muted-foreground">
                  {status === "offline" ? m.status.disconnectedAt : m.status.connectedSince}
                </dt>
                <dd className="text-[15px] font-medium">{since ? `${f.dateTime(since)} · ${f.relative(since)}` : m.common.unknown}</dd>
              </div>
              {machine.terminal_network && (
                <div className="flex flex-col gap-1">
                  <dt className="text-[13px] text-muted-foreground">{m.status.network}</dt>
                  <dd className="text-[15px] font-medium">{machine.terminal_network}</dd>
                </div>
              )}
              {machine.terminal_model && (
                <div className="flex flex-col gap-1">
                  <dt className="text-[13px] text-muted-foreground">{m.status.model}</dt>
                  <dd className="text-[15px] font-medium">{machine.terminal_model}</dd>
                </div>
              )}
              {machine.payter_serial_number && (
                <div className="flex flex-col gap-1">
                  <dt className="text-[13px] text-muted-foreground">{m.status.serial}</dt>
                  <dd className="tabular text-[15px] font-medium">{machine.payter_serial_number}</dd>
                </div>
              )}
              {machine.terminal_flags.length > 0 && (
                <div className="flex flex-col gap-1">
                  <dt className="text-[13px] text-muted-foreground">{m.status.maintenance}</dt>
                  <dd>
                    <ul className="flex flex-col gap-1 text-[14px]">
                      {machine.terminal_flags.map((flag) => (
                        <li key={flag}>{flagLabels[flag] ?? flag}</li>
                      ))}
                    </ul>
                  </dd>
                </div>
              )}
            </dl>
          </details>
        </div>
      </Section>

      {/* The latest payments as a bank lists them: what, when, how much. */}
      {Boolean(health) && attempts > 0 && recent.length > 0 && (
        <Section title={m.status.recentPayments}>
          <RowList>
            {recent.map((payment, i) => {
              const paid = payment.disposition === "APPROVED";
              return (
                <li key={`${payment.occurred_at}-${i}`} className="flex items-center gap-1">
                  <div className="min-w-0 flex-1">
                    <ListRow
                      leading={
                        <Avatar tone={paid ? "neutral" : "negative"}>
                          {payment.product_name ? initial(payment.product_name) : <Link2 />}
                        </Avatar>
                      }
                      title={
                        payment.product_name ??
                        (payment.selection_number ? fmt(m.expiry.selection, { number: payment.selection_number }) : m.common.unknown)
                      }
                      subtitle={`${f.dateTime(payment.occurred_at)} · ${
                        paid ? m.status.paid : (reasonLabels[payment.disposition] ?? payment.disposition)
                      }`}
                      value={
                        <span className={paid ? undefined : "font-medium text-muted-foreground line-through"}>
                          {f.euro(payment.amount)}
                        </span>
                      }
                    />
                  </div>
                  <RecordingLink
                    cameras={cameras}
                    at={payment.occurred_at}
                    label={fmt(m.machines.cameraWatchAt, { time: f.time(payment.occurred_at) })}
                    unnamed={m.machines.cameraUnnamed}
                  />
                </li>
              );
            })}
          </RowList>
          <Link href={`/machines/${machine.id}/payments`} className={cn(buttonVariants({ variant: "outline" }), "w-fit")}>
            {m.status.allPayments}
          </Link>
        </Section>
      )}
    </>
  );
}
