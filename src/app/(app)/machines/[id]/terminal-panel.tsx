import { StatusBadge } from "@/components/machine/status-badge";
import { Panel } from "@/components/page-header";
import { fmt, plural, type Formatters } from "@/i18n/format";
import type { Messages } from "@/i18n/messages";
import { terminalStatus } from "@/lib/terminal-status";
import type { Machine, MachineSalesSplit, PaymentEntry, PaymentHealth } from "@/lib/types";

// Above this share of payments breaking off, the machine or its connection
// deserves a look; a declined card is usually the customer's bank.
const FAILED_WARNING = 0.02;

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
  const flagLabels = m.status.flags as Record<string, string>;
  const reasonLabels = m.status.reasons as Record<string, string>;

  return (
    <Panel
      title={m.status.title}
      actions={
        <StatusBadge
          status={status}
          label={
            status === "online" ? m.status.online : status === "offline" ? m.status.offline : m.status.unknown
          }
          className="text-sm"
        />
      }
    >
      {split.length > 1 && (
        <div className="mb-6 border bg-surface p-4">
          <p className="text-sm font-semibold">{m.status.salesSplit}</p>
          <p className="mb-2 text-xs text-muted-foreground">{m.status.splitHint}</p>
          <ul className="flex flex-col divide-y">
            {split.map((row) => (
              <li key={row.business_id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                <span className="truncate font-semibold">{row.business_name}</span>
                <span className="flex items-baseline gap-3">
                  <span className="text-muted-foreground">
                    {plural(row.units, m.common.salesOne, m.common.salesOther)}
                  </span>
                  <span className="tabular font-semibold">{f.euro(row.revenue)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-3 text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            <dt className="text-muted-foreground">
              {status === "offline" ? m.status.disconnectedAt : m.status.connectedSince}
            </dt>
            <dd className="font-semibold">{since ? `${f.dateTime(since)} · ${f.relative(since)}` : "—"}</dd>
            {machine.terminal_network && (
              <>
                <dt className="text-muted-foreground">{m.status.network}</dt>
                <dd>{machine.terminal_network}</dd>
              </>
            )}
            {machine.terminal_model && (
              <>
                <dt className="text-muted-foreground">{m.status.model}</dt>
                <dd>{machine.terminal_model}</dd>
              </>
            )}
          </dl>
          {status === "offline" && <p className="text-negative">{m.status.offlineHint}</p>}
          {machine.terminal_flags.length > 0 && (
            <div>
              <p className="mb-1 font-semibold">{m.status.maintenance}</p>
              <ul className="list-disc pl-5 text-muted-foreground">
                {machine.terminal_flags.map((flag) => (
                  <li key={flag}>{flagLabels[flag] ?? flag}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 text-sm">
          <p className="font-semibold">{m.status.payments}</p>
          {!health || attempts === 0 ? (
            <p className="text-muted-foreground">{m.status.noPayments}</p>
          ) : (
            <>
              <ul className="grid grid-cols-3 gap-2 text-center">
                <li className="border bg-surface p-2">
                  <span className="tabular block text-lg font-semibold">{f.number(health.approved)}</span>
                  <span className="text-xs text-muted-foreground">{m.status.approved}</span>
                </li>
                <li className="border bg-surface p-2">
                  <span className="tabular block text-lg font-semibold">{f.number(health.declined)}</span>
                  <span className="text-xs text-muted-foreground">{m.status.declined}</span>
                </li>
                <li className={`border p-2 ${failedShare > FAILED_WARNING ? "border-negative/40 bg-card" : "bg-surface"}`}>
                  <span className={`tabular block text-lg font-semibold ${failedShare > FAILED_WARNING ? "text-negative" : ""}`}>
                    {f.number(health.failed)}
                  </span>
                  <span className="text-xs text-muted-foreground">{m.status.failed}</span>
                </li>
              </ul>
              <p className="text-xs text-muted-foreground">
                {failedShare > FAILED_WARNING
                  ? fmt(m.status.failedWarning, { pct: f.percent(failedShare) })
                  : m.status.paymentsHint}
              </p>
              {payments.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold text-muted-foreground">{m.status.recentPayments}</p>
                  <ul className="flex flex-col divide-y">
                    {payments.map((payment, i) => {
                      const paid = payment.disposition === "APPROVED";
                      return (
                        <li
                          key={`${payment.occurred_at}-${i}`}
                          className="flex items-baseline justify-between gap-3 py-1.5"
                        >
                          <span className="flex min-w-0 items-baseline gap-2">
                            <span
                              className={`mt-1 size-2 shrink-0 rounded-full ${paid ? "bg-positive" : "bg-negative"}`}
                              aria-hidden
                            />
                            <span className="min-w-0">
                              <span className="block truncate">
                                {payment.product_name ??
                                  (payment.selection_number
                                    ? fmt(m.expiry.selection, { number: payment.selection_number })
                                    : "—")}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {f.dateTime(payment.occurred_at)} ·{" "}
                                {paid ? m.status.paid : (reasonLabels[payment.disposition] ?? payment.disposition)}
                              </span>
                            </span>
                          </span>
                          <span className={`tabular shrink-0 ${paid ? "" : "text-muted-foreground line-through"}`}>
                            {f.euro(payment.amount)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
                            <p className="text-xs text-muted-foreground">
                {plural(attempts, m.status.attemptsOne, m.status.attemptsOther)}
              </p>
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}
