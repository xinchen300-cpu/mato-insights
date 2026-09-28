"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/client";
import { PERIODS, type Period } from "@/lib/types";

type Option = { id: string; name: string };

export function StatsFilters({
  period,
  from,
  to,
  business,
  machine,
  product,
  businesses,
  machines,
  products,
}: {
  period: Period;
  from: string | null;
  to: string | null;
  business: string | null;
  machine: string | null;
  product: string | null;
  businesses: Option[];
  machines: (Option & { businessId: string | null })[];
  products: Option[];
}) {
  const { m } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [customFrom, setCustomFrom] = useState(from ?? "");
  const [customTo, setCustomTo] = useState(to ?? "");

  function update(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    startTransition(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  const machineOptions = business ? machines.filter((mc) => mc.businessId === business) : machines;
  const selectClass =
    "h-10 w-full border border-input bg-card px-3 text-base outline-none focus-visible:border-ring md:text-sm";

  return (
    <div className={cn("flex flex-col gap-4 border bg-card p-4 sm:p-5", isPending && "opacity-70")}>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => (p === "custom" ? update({ period: "custom" }) : update({ period: p, from: null, to: null }))}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors",
              period === p ? "border-foreground bg-foreground text-background" : "hover:border-primary",
            )}
          >
            {m.periods[p]}
          </button>
        ))}
      </div>

      {period === "custom" && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
            {m.periods.from}
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className={selectClass} />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
            {m.periods.to}
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className={selectClass} />
          </label>
          <Button
            variant="outline"
            disabled={!customFrom || !customTo || customTo < customFrom}
            onClick={() => update({ period: "custom", from: customFrom, to: customTo })}
          >
            {m.periods.apply}
          </Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <select
          aria-label={m.stats.business}
          value={business ?? ""}
          onChange={(e) => update({ business: e.target.value || null, machine: null })}
          className={selectClass}
        >
          <option value="">{m.stats.allBusinesses}</option>
          {businesses.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select
          aria-label={m.stats.machine}
          value={machine ?? ""}
          onChange={(e) => update({ machine: e.target.value || null })}
          className={selectClass}
        >
          <option value="">{m.stats.allMachines}</option>
          {machineOptions.map((mc) => (
            <option key={mc.id} value={mc.id}>
              {mc.name}
            </option>
          ))}
        </select>
        <select
          aria-label={m.stats.product}
          value={product ?? ""}
          onChange={(e) => update({ product: e.target.value || null })}
          className={selectClass}
        >
          <option value="">{m.stats.allProducts}</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
