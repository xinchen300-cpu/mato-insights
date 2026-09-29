"use client";

import { Trash2 } from "lucide-react";
import { Panel } from "@/components/page-header";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { wasteVerdict } from "@/lib/stats";
import type { WasteRow } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * What ended up in the bin, per product, in pieces and in euro. The share is
 * only named when enough pieces went through the slot to mean anything — one
 * out of two is not a 50% problem.
 */
export function WasteList({ rows }: { rows: WasteRow[] }) {
  const { m, f } = useI18n();
  const total = rows.reduce((sum, row) => sum + row.value_expired, 0);
  const anyWorthActing = rows.some((row) => wasteVerdict(row.qty_expired, row.qty_sold) === "worthActing");

  return (
    <Panel title={m.expiry.binTitle} hint={m.expiry.binHint}>
      <p className="tabular -mt-1 mb-1 font-heading text-lg font-semibold text-heading">
        {fmt(m.expiry.binTotal, { value: f.euro(total) })}
      </p>
      <ul className="flex flex-col divide-y">
        {rows.map((row) => {
          const verdict = wasteVerdict(row.qty_expired, row.qty_sold);
          return (
            <li key={row.product_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-semibold">
                  <Trash2
                    className={cn("size-4 shrink-0", verdict === "worthActing" ? "text-negative" : "text-muted-foreground")}
                  />
                  {row.product_name}
                </span>
                <span className="figure block truncate text-sm text-muted-foreground">
                  {row.producer_name ? `${row.producer_name} · ` : ""}
                  {fmt(m.expiry.binSold, { count: row.qty_sold })}
                </span>
              </span>
              <span className="text-right text-sm">
                <span className="tabular block font-semibold">
                  {fmt(m.expiry.expiredCount, { count: row.qty_expired })} · {f.euro(row.value_expired)}
                </span>
                <span
                  className={cn(
                    "figure block text-xs",
                    verdict === "worthActing" ? "font-semibold text-negative" : "text-muted-foreground",
                  )}
                >
                  {verdict === "tooFew"
                    ? m.expiry.binTooFew
                    : verdict === "worthActing"
                      ? `${fmt(m.expiry.binShare, { percent: f.percent(row.share_expired ?? 0) })} · ${m.expiry.binWorthActing}`
                      : fmt(m.expiry.binShare, { percent: f.percent(row.share_expired ?? 0) })}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      {anyWorthActing && <p className="mt-3 text-sm text-muted-foreground">{m.expiry.binAdvice}</p>}
    </Panel>
  );
}
