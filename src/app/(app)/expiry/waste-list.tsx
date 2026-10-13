"use client";

import { Trash2 } from "lucide-react";
import { Avatar, ListRow } from "@/components/list-row";
import { Section } from "@/components/page-header";
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

  // The total is the one big figure here: the amount large, the words of the
  // same sentence quietly around it.
  const [before, after = ""] = m.expiry.binTotal.split("{value}");

  return (
    <Section title={m.expiry.binTitle} hint={m.expiry.binHint}>
      <div className="surface-card">
        <p className="tabular flex flex-col gap-2 px-5 pb-3 pt-6 sm:px-6 sm:pt-7">
          {before.trim() && <span className="text-[14px] font-medium text-muted-foreground">{before}</span>}
          <span className="font-heading text-[36px] font-semibold leading-none tracking-[-0.04em] text-heading sm:text-[44px]">
            {f.euro(total)}
          </span>
          {after.trim() && <span className="text-[14px] font-medium text-muted-foreground">{after}</span>}
        </p>
        <ul className="flex flex-col p-2">
          {rows.map((row) => {
            const verdict = wasteVerdict(row.qty_expired, row.qty_sold);
            return (
              <li key={row.product_id}>
                <ListRow
                  leading={
                    <Avatar tone={verdict === "worthActing" ? "negative" : "neutral"}>
                      <Trash2 />
                    </Avatar>
                  }
                  title={row.product_name}
                  subtitle={
                    <>
                      <span className="figure block truncate">
                        {fmt(m.expiry.binSold, { count: row.qty_sold })}
                      </span>
                      <span
                        className={cn(
                          "figure mt-0.5 block whitespace-normal leading-snug",
                          verdict === "worthActing" && "font-semibold text-negative",
                        )}
                      >
                        {verdict === "tooFew"
                          ? m.expiry.binTooFew
                          : verdict === "worthActing"
                            ? `${fmt(m.expiry.binShare, { percent: f.percent(row.share_expired ?? 0) })} · ${m.expiry.binWorthActing}`
                            : fmt(m.expiry.binShare, { percent: f.percent(row.share_expired ?? 0) })}
                      </span>
                    </>
                  }
                  value={f.euro(row.value_expired)}
                  valueSub={
                    <span className="tabular text-muted-foreground">
                      {fmt(m.expiry.expiredCount, { count: row.qty_expired })}
                    </span>
                  }
                />
              </li>
            );
          })}
        </ul>
      </div>
      {anyWorthActing && <p className="px-1 text-[13.5px] text-muted-foreground">{m.expiry.binAdvice}</p>}
    </Section>
  );
}
