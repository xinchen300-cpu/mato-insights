import Link from "next/link";
import { Link2 } from "lucide-react";
import { MiniStat } from "@/components/kpi";
import { Avatar, ListRow, RowList, initial } from "@/components/list-row";
import { StatusBadge } from "@/components/machine/status-badge";
import { Section } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { fmt, plural, type Formatters } from "@/i18n/format";
import type { Messages } from "@/i18n/messages";
import { shareIsReal } from "@/lib/stats";
import { terminalStatus } from "@/lib/terminal-status";
import { cn } from "@/lib/utils";
import type { Machine, MachineSalesSplit, PaymentEntry, PaymentHealth } from "@/lib/types";

// Above this share of payments breaking off, the machine or its connection
// deserves a look; a declined card is usually the customer's bank.
const FAILED_WARNING = 0.02;

/** The terminal's connection as a dot and a word, for the top of the machine's page. */
export function MachineStatus({ machine, m, className }: { machine: Machine; m: Messages; className?: string }) {
  const status = terminalStatus(machine.last_connected_at, machine.last_disconnected_at);
  return (
    <StatusBadge
      status={status}
      label={status === "online" ? m.status.online : status === "offline" ? m.status.offline : m.status.unknown}
      className={className}
    />
  );
}

export function TerminalPanel({
  machine,
  health,
  payments,
  split,
  m,
  f,
}: {
  machine: Machine;
  health: PaymentHealth | undefined;
  payments: PaymentEntry[];
  /** Two rows when two businesses share the machine. */
  split: MachineSalesSplit[];
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

  return (
    <>
      <Section title={m.status.title}>
        {split.length > 1 && (
          <div className="surface-card p-2">
            <div className="px-3 pb-1 pt-3">
              <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{m.status.salesSplit}</h3>
              <p className="mt-0.5 text-[13px] text-muted-foreground">{m.status.splitHint}</p>
            </div>
            <ul className="flex flex-col">
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
          </div>
        )}

        <div className="surface-card grid gap-8 p-5 sm:p-6 lg:grid-cols-2 lg:gap-12">
          {/* The connection, read like the details of an account: a grey label, the value under it. */}
          <div className="flex flex-col gap-5">
            <dl className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <dt className="text-[13px] text-muted-foreground">
                  {status === "offline" ? m.status.disconnectedAt : m.status.connectedSince}
                </dt>
                <dd className="text-[15px] font-semibold tracking-[-0.01em]">
                  {since ? `${f.dateTime(since)} · ${f.relative(since)}` : "—"}
                </dd>
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
            </dl>
            {status === "offline" && <p className="text-[14px] text-negative">{m.status.offlineHint}</p>}
            {machine.terminal_flags.length > 0 && (
              <div>
                <p className="mb-1.5 text-[13px] font-semibold">{m.status.maintenance}</p>
                <ul className="flex flex-col gap-1 text-[14px] text-muted-foreground">
                  {machine.terminal_flags.map((flag) => (
                    <li key={flag} className="flex items-baseline gap-2.5">
                      <span className="size-1 shrink-0 -translate-y-0.5 rounded-full bg-muted-foreground/60" aria-hidden />
                      {flagLabels[flag] ?? flag}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* The last 30 days of payments: three figures, then what they mean. */}
          <div className="flex flex-col gap-4">
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
                <p className="text-[13px] text-muted-foreground">
                  {failing ? fmt(m.status.failedWarning, { pct: f.percent(failedShare) }) : m.status.paymentsHint}
                </p>
                <p className="text-[12.5px] text-muted-foreground">
                  {plural(attempts, m.status.attemptsOne, m.status.attemptsOther)}
                </p>
              </>
            )}
          </div>
        </div>
      </Section>

      {/* The latest payments as a bank lists them: what, when, how much. */}
      {Boolean(health) && attempts > 0 && payments.length > 0 && (
        <Section title={m.status.recentPayments}>
          <RowList>
            {payments.map((payment, i) => {
              const paid = payment.disposition === "APPROVED";
              return (
                <li key={`${payment.occurred_at}-${i}`}>
                  <ListRow
                    leading={
                      <Avatar tone={paid ? "neutral" : "negative"}>
                        {payment.product_name ? initial(payment.product_name) : <Link2 />}
                      </Avatar>
                    }
                    title={
                      payment.product_name ??
                      (payment.selection_number ? fmt(m.expiry.selection, { number: payment.selection_number }) : "—")
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
