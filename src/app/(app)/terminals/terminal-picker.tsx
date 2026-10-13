"use client";

import { useState, useTransition } from "react";
import { Check, Nfc } from "lucide-react";
import { Avatar } from "@/components/list-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { needsQuote, planById, LARGEST_PLAN } from "@/lib/plans";
import { upgradeLine } from "@/lib/billing-copy";
import { cn } from "@/lib/utils";
import { saveTerminalChoices } from "./actions";
import { MachineIcon } from "@/components/machine/machine-icon";

export type TerminalRow = {
  serial: string;
  model: string | null;
  lastSeenLabel: string | null;
  /** The name it already carries here, if it was picked before. */
  name: string;
  mine: boolean;
  /** Whether sales already came in from it, which usually settles the question. */
  hasSales: boolean;
  /** Linked here, but no longer on the Payter account. */
  orphan?: boolean;
};

/**
 * Which of the terminals on the Payter account belong to this operator, and
 * what to call them. One login can carry another business's machines, so this
 * is a question only the operator can answer — and it has to be answered
 * before any figure means anything.
 */
export function TerminalPicker({
  rows,
  planId,
  paymentsEnabled,
}: {
  rows: TerminalRow[];
  /** The package now; null for the vendor or an account without one. */
  planId: string | null;
  paymentsEnabled: boolean;
}) {
  const { m, f } = useI18n();
  const [state, setState] = useState(rows);
  const [saved, setSaved] = useState(false);
  const [missingName, setMissingName] = useState(false);
  const [isPending, startTransition] = useTransition();

  const chosen = state.filter((r) => r.mine).length;
  // Ticking one machine too many moves the package up. Say so while ticking,
  // before Save, so the new price is something they saw rather than found.
  const current = planById(planId);
  const upgrade = upgradeLine(m, f, current, chosen, paymentsEnabled);

  function set(serial: string, patch: Partial<TerminalRow>) {
    setSaved(false);
    setState((current) => current.map((r) => (r.serial === serial ? { ...r, ...patch } : r)));
  }

  function save() {
    // A machine called APO20254101352 is a machine nobody recognises.
    if (state.some((r) => r.mine && !r.name.trim())) {
      setMissingName(true);
      return;
    }
    setMissingName(false);
    startTransition(async () => {
      await saveTerminalChoices(state.map((r) => ({ serial: r.serial, mine: r.mine, name: r.name })));
      setSaved(true);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <ul className="surface-card flex flex-col p-2">
        {state.map((row) => (
          // One terminal per row. Wide: token, what it is, the switch, its name —
          // in DOM order, so focus moves left to right.
          // On a phone the switch stays beside the serial and the name drops under it.
          <li
            key={row.serial}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-3 rounded-xl px-3 py-3.5 sm:grid-cols-[auto_minmax(0,1fr)_auto_14rem] sm:gap-x-4"
          >
            <Avatar>{row.name.trim() ? <MachineIcon /> : <Nfc />}</Avatar>

            <span className="min-w-0">
              <span className="block truncate font-mono text-[14px] font-semibold">{row.serial}</span>
              <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                {[
                  row.model,
                  row.lastSeenLabel ? `${m.terminals.lastSeen}: ${row.lastSeenLabel}` : m.terminals.never,
                  row.hasSales ? m.terminals.hasSales : null,
                  row.orphan ? m.billing.orphan : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>

            <button
              type="button"
              aria-pressed={row.mine}
              aria-label={m.terminals.mine}
              onClick={() => set(row.serial, { mine: !row.mine })}
              className={cn(
                "relative inline-flex h-8 w-[52px] shrink-0 items-center rounded-full p-1 outline-none transition-colors duration-200 before:absolute before:-inset-1.5 before:content-[''] focus-visible:ring-3 focus-visible:ring-ring/40 sm:col-start-3 sm:row-start-1",
                row.mine ? "bg-positive" : "bg-input",
              )}
            >
              <span
                className={cn(
                  "grid size-6 place-items-center rounded-full bg-white shadow-[0_1px_3px_rgb(14_14_16/0.1)] transition-transform duration-200",
                  row.mine && "translate-x-5",
                )}
              >
                {row.mine && <Check className="size-3.5 text-positive" strokeWidth={3} />}
              </span>
            </button>

            <Input
              value={row.name}
              onChange={(e) => set(row.serial, { name: e.target.value })}
              placeholder={m.terminals.namePlaceholder}
              aria-label={m.terminals.nameLabel}
              disabled={!row.mine}
              className="col-span-2 col-start-2 w-full sm:col-span-1 sm:col-start-4 sm:row-start-1"
            />
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button onClick={save} disabled={isPending}>
          {isPending ? m.terminals.saving : m.terminals.save}
        </Button>
        <span className="tabular text-[14px] text-muted-foreground">
          {fmt(m.terminals.chosen, { count: chosen, total: state.length })}
        </span>
        {saved && <span className="text-[13.5px] font-medium text-positive">{m.terminals.saved}</span>}
        {missingName && <span className="text-[13.5px] font-medium text-negative">{m.terminals.nameNeeded}</span>}
      </div>
      {upgrade && (
        <p role="status" className="max-w-[60ch] rounded-2xl bg-surface p-4 text-[14px]">
          {upgrade}
        </p>
      )}
      {current && needsQuote(chosen) && (
        <p className="max-w-[60ch] px-1 text-[14px] text-muted-foreground">
          {fmt(m.billing.quoteNeeded, { count: LARGEST_PLAN.maxMachines })}
        </p>
      )}
    </div>
  );
}
