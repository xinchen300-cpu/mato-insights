"use client";

import { useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
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
  machines: (Option & { businessIds: string[] })[];
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

  const machineOptions = business ? machines.filter((mc) => mc.businessIds.includes(business)) : machines;
  // Narrowing the business must not leave a machine selected that the list no
  // longer offers, or the bar says "all machines" while one is filtered out.
  const machineValue = machineOptions.some((mc) => mc.id === machine) ? machine : "";
  // 16px on phones so iOS does not zoom into the field on focus.
  const fieldClass =
    "h-11 w-full min-w-0 rounded-xl border border-input bg-card px-3.5 text-base outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 sm:h-10 md:text-sm";
  // Filter pills, as on Producten: soft grey at rest, near-black once they narrow the figures.
  const selectClass = (active: boolean) =>
    cn(
      "field-sizing-content h-10 max-w-full min-w-0 cursor-pointer appearance-none truncate rounded-full pl-4 pr-9 text-base font-medium outline-none transition-[background-color,color,box-shadow] duration-150 focus-visible:ring-3 focus-visible:ring-ring/40 md:h-9 md:text-[13.5px] [&>option]:bg-card [&>option]:text-foreground",
      active ? "bg-foreground text-background" : "bg-surface text-foreground hover:bg-[#e6e6e9]",
    );
  const chevron = (active: boolean) => (
    <ChevronDown
      className={cn(
        "pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2",
        active ? "text-background/70" : "text-muted-foreground",
      )}
      aria-hidden="true"
    />
  );
  // A filter with nothing to choose stays away: one business, one machine.
  // One that is set stays, so it can always be cleared.
  const showBusiness = businesses.length > 1 || Boolean(business);
  const showMachine = machineOptions.length > 1 || Boolean(machineValue);
  const showProduct = products.length > 1 || Boolean(product);

  return (
    <div aria-busy={isPending} className={cn("flex flex-col gap-3 transition-opacity duration-150", isPending && "opacity-70")}>
      <div className="flex max-w-full gap-1 self-start overflow-x-auto rounded-full bg-surface p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={period === p}
            onClick={() => (p === "custom" ? update({ period: "custom" }) : update({ period: p, from: null, to: null }))}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-[14px] font-medium outline-none transition-[background-color,color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 sm:px-3.5 sm:py-1.5 sm:text-[13.5px]",
              period === p
                ? "bg-card text-foreground shadow-[0_1px_3px_rgb(14_14_16/0.1)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m.periods[p]}
          </button>
        ))}
      </div>

      {period === "custom" && (
        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
          <label className="grid min-w-0 gap-1.5 text-[13px] font-medium text-muted-foreground">
            {m.periods.from}
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className={cn(fieldClass, "sm:w-44")}
            />
          </label>
          <label className="grid min-w-0 gap-1.5 text-[13px] font-medium text-muted-foreground">
            {m.periods.to}
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className={cn(fieldClass, "sm:w-44")}
            />
          </label>
          <Button
            disabled={!customFrom || !customTo || customTo < customFrom}
            onClick={() => update({ period: "custom", from: customFrom, to: customTo })}
            className="col-span-2 h-11 sm:h-10"
          >
            {m.periods.apply}
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {showBusiness && (
          <div className="relative min-w-0 max-w-full">
            <select
              aria-label={m.stats.business}
              value={business ?? ""}
              onChange={(e) => update({ business: e.target.value || null, machine: null })}
              className={selectClass(Boolean(business))}
            >
              <option value="">{m.stats.allBusinesses}</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            {chevron(Boolean(business))}
          </div>
        )}
        {showMachine && (
          <div className="relative min-w-0 max-w-full">
            <select
              aria-label={m.stats.machine}
              value={machineValue ?? ""}
              onChange={(e) => update({ machine: e.target.value || null })}
              className={selectClass(Boolean(machineValue))}
            >
              <option value="">{m.stats.allMachines}</option>
              {machineOptions.map((mc) => (
                <option key={mc.id} value={mc.id}>
                  {mc.name}
                </option>
              ))}
            </select>
            {chevron(Boolean(machineValue))}
          </div>
        )}
        {showProduct && (
          <div className="relative min-w-0 max-w-full">
            <select
              aria-label={m.stats.product}
              value={product ?? ""}
              onChange={(e) => update({ product: e.target.value || null })}
              className={selectClass(Boolean(product))}
            >
              <option value="">{m.stats.allProducts}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {chevron(Boolean(product))}
          </div>
        )}
      </div>
    </div>
  );
}
