"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { TriangleAlert, Tag } from "lucide-react";
import { Avatar, RowList } from "@/components/list-row";
import { Section } from "@/components/page-header";
import { Button } from "@/components/ui/button";
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
    <Section title={m.unassigned.priceTitle} hint={m.unassigned.priceHint}>
      <RowList>
        {rows.map((row) => {
          // One steady other price: the figure here is just stale.
          const stale = row.spread === 0;
          const done = fixed.has(row.product_id);
          return (
            <li
              key={`${row.machine_id}:${row.selection_number}`}
              className="flex flex-col gap-3 rounded-xl px-3 py-3.5 sm:flex-row sm:items-center sm:gap-4"
            >
              <div className="flex min-w-0 flex-1 items-start gap-3.5">
                <Avatar tone={stale ? "warning" : "negative"}>{stale ? <Tag /> : <TriangleAlert />}</Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold tracking-[-0.01em]">{row.product_name}</p>
                  <Link
                    href={`/machines/${row.machine_id}`}
                    className="mt-0.5 block truncate text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {row.machine_name} · {fmt(m.unassigned.priceSlot, { number: row.selection_number })} ·{" "}
                    {fmt(m.unassigned.priceSales, { count: row.sales })}
                  </Link>
                  <p className="figure mt-1.5 text-[14px] leading-snug">
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
                  </p>
                </div>
              </div>
              {stale && (
                <div className="pl-[54px] sm:shrink-0 sm:pl-0">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={done || isPending}
                    onClick={() => fix(row)}
                    className="h-10 sm:h-8"
                  >
                    {done
                      ? m.common.saved
                      : busy === row.product_id
                        ? m.unassigned.priceStaleFixing
                        : fmt(m.unassigned.priceStaleFix, { paid: f.euro(row.usual_price) })}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </RowList>
    </Section>
  );
}
