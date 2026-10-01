"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { TriangleAlert, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/page-header";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import type { PriceMismatch } from "@/lib/types";
import { setProductPrice } from "./actions";

/**
 * One symptom, two illnesses. A slot that always takes the same other amount
 * has a price here that is simply out of date, and that is one tap to put
 * right. A slot taking many different amounts is carrying several products
 * through one number, and then nothing honest can be said about what sold —
 * so it says that instead.
 */
export function PriceMismatches({ rows }: { rows: PriceMismatch[] }) {
  const { m, f } = useI18n();
  const [fixed, setFixed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function fix(row: PriceMismatch) {
    setBusy(row.product_id);
    startTransition(async () => {
      try {
        await setProductPrice(row.product_id, row.usual_price);
        setFixed((current) => new Set(current).add(row.product_id));
      } finally {
        setBusy(null);
      }
    });
  }

  return (
    <Panel title={m.unassigned.priceTitle} hint={m.unassigned.priceHint}>
      <ul className="flex flex-col divide-y">
        {rows.map((row) => {
          // One steady other price: the figure here is just stale.
          const stale = row.spread === 0;
          const done = fixed.has(row.product_id);
          return (
            <li
              key={`${row.machine_id}:${row.selection_number}`}
              className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3.5"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 font-semibold">
                  {stale ? (
                    <Tag className="size-4 shrink-0 text-warning" />
                  ) : (
                    <TriangleAlert className="size-4 shrink-0 text-negative" />
                  )}
                  {row.product_name}
                </span>
                <Link
                  href={`/machines/${row.machine_id}`}
                  className="block truncate text-sm text-muted-foreground hover:text-foreground"
                >
                  {row.machine_name} · {fmt(m.unassigned.priceSlot, { number: row.selection_number })} ·{" "}
                  {fmt(m.unassigned.priceSales, { count: row.sales })}
                </Link>
                <span className="figure mt-1 block text-sm">
                  {stale
                    ? fmt(m.unassigned.priceStale, {
                        paid: f.euro(row.usual_price),
                        listed: f.euro(row.list_price),
                      })
                    : fmt(m.unassigned.priceMixed, {
                        count: row.distinct_prices,
                        low: f.euro(row.usual_price - row.spread > 0 ? row.usual_price - row.spread : 0),
                        high: f.euro(row.usual_price),
                      })}
                </span>
              </span>
              {stale && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={done || isPending}
                  onClick={() => fix(row)}
                  className="shrink-0"
                >
                  {done
                    ? m.common.saved
                    : busy === row.product_id
                      ? m.unassigned.priceStaleFixing
                      : fmt(m.unassigned.priceStaleFix, { paid: f.euro(row.usual_price) })}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
