"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { needsQuote, planById, LARGEST_PLAN } from "@/lib/plans";
import { upgradeLine } from "@/lib/billing-copy";
import { cn } from "@/lib/utils";
import { saveTerminalChoices } from "./actions";

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
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col divide-y border bg-card">
        {state.map((row) => (
          <li key={row.serial} className={cn("flex flex-wrap items-center gap-3 p-4", row.mine && "bg-accent/40")}>
            <button
              type="button"
              aria-pressed={row.mine}
              aria-label={m.terminals.mine}
              onClick={() => set(row.serial, { mine: !row.mine })}
              className={cn(
                "grid size-9 shrink-0 place-items-center border-2 transition-colors",
                row.mine ? "border-positive bg-positive text-white" : "border-input bg-card",
              )}
            >
              {row.mine && <Check className="size-5" strokeWidth={3} />}
            </button>

            <span className="min-w-0 flex-1">
              <span className="block font-mono text-sm font-semibold">{row.serial}</span>
              <span className="block truncate text-xs text-muted-foreground">
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

            <Input
              value={row.name}
              onChange={(e) => set(row.serial, { name: e.target.value })}
              placeholder={m.terminals.namePlaceholder}
              aria-label={m.terminals.nameLabel}
              disabled={!row.mine}
              className="w-full sm:w-56"
            />
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={isPending}>
          {isPending ? m.terminals.saving : m.terminals.save}
        </Button>
        <span className="tabular text-sm text-muted-foreground">
          {fmt(m.terminals.chosen, { count: chosen, total: state.length })}
        </span>
        {saved && <span className="text-sm text-positive">{m.terminals.saved}</span>}
        {missingName && <span className="text-sm text-negative">{m.terminals.nameNeeded}</span>}
      </div>
      {upgrade && (
        <p role="status" className="max-w-[60ch] bg-surface p-4 text-sm">
          {upgrade}
        </p>
      )}
      {current && needsQuote(chosen) && (
        <p className="max-w-[60ch] text-sm text-muted-foreground">
          {fmt(m.billing.quoteNeeded, { count: LARGEST_PLAN.maxMachines })}
        </p>
      )}
    </div>
  );
}
