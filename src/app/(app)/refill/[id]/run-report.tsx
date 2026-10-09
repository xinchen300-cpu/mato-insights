"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import type { RunSummaryRow } from "@/lib/types";

/**
 * What the shop and each producer need to hear after a run, ready to paste
 * into a message. Grouped by producer, because that is who acts on it.
 */
export function RunReport({ rows, when }: { rows: RunSummaryRow[]; when: string }) {
  const { m } = useI18n();
  const [copied, setCopied] = useState<string | null>(null);

  const groups = new Map<string, { name: string; rows: RunSummaryRow[] }>();
  for (const row of rows) {
    const key = row.producer_id ?? "none";
    const group = groups.get(key) ?? { name: row.producer_name ?? m.refill.reportNoProducer, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }

  function lineOf(row: RunSummaryRow) {
    return [
      row.filled > 0 ? `${row.filled} ${m.refill.reportFilled}` : null,
      row.expired > 0 ? `${row.expired} ${m.refill.reportExpired}` : null,
      row.short > 0 ? `${row.short} ${m.refill.reportShort}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  async function copy(key: string, group: { name: string; rows: RunSummaryRow[] }) {
    const text = [`${group.name} — ${when}`, ...group.rows.map((r) => `${r.product_name}: ${lineOf(r)}`)].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Some browsers refuse without a gesture they recognise; the text stays
      // on screen to select by hand.
    }
  }

  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{m.refill.reportEmpty}</p>;

  return (
    <div className="flex flex-col divide-y divide-border">
      {[...groups.entries()].map(([key, group]) => (
        <div key={key} className="py-4 first:pt-1 last:pb-1">
          <div className="flex items-center justify-between gap-3">
            <h3 className="min-w-0 truncate text-[17px] font-semibold tracking-[-0.015em]">{group.name}</h3>
            <Button variant="secondary" size="sm" onClick={() => copy(key, group)} className="shrink-0">
              {copied === key ? <Check /> : <Copy />}
              {copied === key ? m.refill.reportCopied : m.refill.reportCopy}
            </Button>
          </div>
          <ul className="mt-2 flex flex-col">
            {group.rows.map((row) => (
              <li key={row.product_id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-1.5">
                <span className="min-w-0 truncate text-[15px]">{row.product_name}</span>
                <span className="tabular flex shrink-0 flex-wrap items-center justify-end gap-x-3 text-[13.5px]">
                  {row.filled > 0 && (
                    <span className="text-muted-foreground">
                      {row.filled} {m.refill.reportFilled}
                    </span>
                  )}
                  {row.expired > 0 && (
                    <span className="inline-flex items-center gap-1.5 font-medium text-warning">
                      <span className="size-1.5 rounded-full bg-warning" aria-hidden="true" />
                      {row.expired} {m.refill.reportExpired}
                    </span>
                  )}
                  {row.short > 0 && (
                    <span className="inline-flex items-center gap-1.5 font-semibold text-negative">
                      <span className="size-1.5 rounded-full bg-negative" aria-hidden="true" />
                      {row.short} {m.refill.reportShort}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
