"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Avatar, initial } from "@/components/list-row";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import type { Disposition, ItemReport } from "@/lib/refill-flow";
import { cn } from "@/lib/utils";

/**
 * A finished round, product by product: how many came out of the fridge,
 * went into the machines, came back, or were taken out and why, and where
 * that went. The same, as text, to paste into a message.
 */
export function RoundReport({ items, heading }: { items: ItemReport[]; heading: string }) {
  const { m } = useI18n();
  const t = m.refill;
  const [copied, setCopied] = useState(false);

  const went: Record<Disposition, string> = {
    stock: t.wentStock,
    waste: t.wentWaste,
    promo: t.wentPromo,
    staff: t.wentStaff,
    other: t.wentOther,
  };

  // The numbers worth saying about one product, in the order a person reads them.
  function facts(item: ItemReport): { label: string; tone?: "warning" | "negative" }[] {
    return [
      item.taken > 0 ? { label: `${item.taken} ${t.reportTaken}` } : null,
      item.back > 0 ? { label: `${item.back} ${t.reportBack}` } : null,
      item.out.expired > 0 ? { label: `${item.out.expired} ${t.reportExpired}`, tone: "negative" as const } : null,
      item.out.damaged > 0 ? { label: `${item.out.damaged} ${t.reportDamaged}`, tone: "negative" as const } : null,
      item.out.nearExpiry > 0 ? { label: `${item.out.nearExpiry} ${t.reportNear}`, tone: "warning" as const } : null,
      item.out.other > 0 ? { label: `${item.out.other} ${t.reportOtherOut}`, tone: "warning" as const } : null,
      item.short > 0 ? { label: `${item.short} ${t.reportShort}`, tone: "warning" as const } : null,
    ].filter((fact): fact is { label: string; tone?: "warning" | "negative" } => fact !== null);
  }

  const wentLine = (item: ItemReport) =>
    (Object.entries(item.went) as [Disposition, number][])
      .filter(([, qty]) => qty > 0)
      .map(([where, qty]) => `${qty} ${went[where]}`)
      .join(" · ");

  async function copy() {
    const text = [
      heading,
      ...items.map((item) =>
        [`${item.name}: ${item.filled} ${t.reportFilled}`, ...facts(item).map((fact) => fact.label)].join(" · "),
      ),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // The report stays on screen to select by hand.
    }
  }

  if (items.length === 0) return <p className="text-sm text-muted-foreground">{t.reportEmpty}</p>;

  const total = (pick: (item: ItemReport) => number) => items.reduce((sum, item) => sum + pick(item), 0);
  const totals = [
    { label: t.reportFilled, value: total((i) => i.filled) },
    { label: t.reportBack, value: total((i) => i.back) },
    { label: t.reportExpired, value: total((i) => i.out.expired) },
    { label: t.reportShort, value: total((i) => i.short) },
  ].filter((entry, index) => index === 0 || entry.value > 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {totals.map((entry) => (
            <span key={entry.label} className="text-[14.5px] text-muted-foreground">
              <b className="tabular text-[17px] text-foreground">{entry.value}</b> {entry.label}
            </span>
          ))}
        </div>
        <Button variant="secondary" size="sm" onClick={copy} className="shrink-0">
          {copied ? <Check /> : <Copy />}
          {copied ? t.reportCopied : t.reportCopy}
        </Button>
      </div>

      <ul className="flex flex-col divide-y divide-border">
        {items.map((item) => {
          const list = facts(item);
          const where = wentLine(item);
          return (
            <li key={item.productId} className="flex items-start gap-3.5 py-3.5 first:pt-1 last:pb-1">
              <Avatar>{initial(item.name)}</Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-[15.5px] font-semibold leading-snug">{item.name}</p>
                {list.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {list.map((fact) => (
                      <span
                        key={fact.label}
                        className={cn(
                          "tabular rounded-full px-2.5 py-1 text-[13px] font-medium",
                          fact.tone === "negative"
                            ? "bg-negative/10 text-negative"
                            : fact.tone === "warning"
                              ? "bg-warning/15 text-foreground"
                              : "bg-surface text-foreground",
                        )}
                      >
                        {fact.label}
                      </span>
                    ))}
                  </div>
                )}
                {where && <p className="mt-1.5 text-[13px] text-muted-foreground">{where}</p>}
              </div>
              <div className="shrink-0 text-right">
                <p className="tabular text-[22px] font-semibold leading-none tracking-[-0.02em]">{item.filled}</p>
                <p className="mt-1 text-[12px] text-muted-foreground">{t.reportFilled}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
