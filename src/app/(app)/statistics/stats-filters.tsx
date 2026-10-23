"use client";

import { useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/client";
import { DISPLAY_TIME_ZONE } from "@/i18n/format";
import { PERIODS, type Period } from "@/lib/types";

type Option = { id: string; name: string };

/** How many months back "Maand kiezen" offers (Xin, 21-10-2026: "filter per maand"). */
const MONTHS_BACK = 12;

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-09" → "2026-09-30". */
function lastDayOf(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return `${month}-${pad(new Date(Date.UTC(year, m, 0)).getUTCDate())}`;
}

/** This month and the ones before it, newest first: ["2026-10", "2026-09", …]. */
function recentMonths(today: string): string[] {
  let [year, month] = today.slice(0, 7).split("-").map(Number);
  const months: string[] = [];
  for (let i = 0; i < MONTHS_BACK; i++) {
    months.push(`${year}-${pad(month)}`);
    month -= 1;
    if (month === 0) [year, month] = [year - 1, 12];
  }
  return months;
}

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
  const { m, f } = useI18n();
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
      active ? "bg-foreground text-background" : "bg-surface text-foreground hover:bg-hover",
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

  // A whole month as the period (or this month so far), picked from a list instead of two dates.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: DISPLAY_TIME_ZONE }).format(new Date());
  const months = recentMonths(today);
  const monthEnd = (month: string) => (lastDayOf(month) < today ? lastDayOf(month) : today);
  const pickedMonth =
    period === "custom" && from && to
      ? (months.find((month) => from === `${month}-01` && (to === lastDayOf(month) || to === monthEnd(month))) ?? "")
      : "";
  // A picked month shows as the month, not as two dates; "Zelf kiezen" opens the dates again.
  const [ownDates, setOwnDates] = useState(!pickedMonth);

  return (
    <div aria-busy={isPending} className={cn("flex flex-col gap-3 transition-opacity duration-150", isPending && "opacity-70")}>
      <div className="flex max-w-full gap-1 self-start overflow-x-auto rounded-full bg-surface p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={period === p && !(p === "custom" && pickedMonth && !ownDates)}
            onClick={() =>
              p === "custom"
                ? period === "custom"
                  ? setOwnDates(true)
                  : update({ period: "custom" })
                : update({ period: p, from: null, to: null })
            }
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-[14px] font-medium outline-none transition-[background-color,color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 sm:px-3.5 sm:py-1.5 sm:text-[13.5px]",
              period === p && !(p === "custom" && pickedMonth && !ownDates)
                ? "bg-card text-foreground shadow-[0_1px_3px_rgb(14_14_16/0.1)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m.periods[p]}
          </button>
        ))}
      </div>

      {period === "custom" && ownDates && (
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

      {/* Per automaat as buttons in sight rather than a list to open (Xin, 21-10-2026). */}
      {showMachine && (
        <div
          role="group"
          aria-label={m.stats.machine}
          className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {[{ id: "", name: m.stats.allMachines }, ...machineOptions].map((mc) => (
            <button
              key={mc.id || "all"}
              type="button"
              aria-pressed={(machineValue ?? "") === mc.id}
              onClick={() => update({ machine: mc.id || null })}
              className="h-9 shrink-0 rounded-full border border-border px-3.5 text-[13.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background"
            >
              {mc.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-0 max-w-full">
          <select
            aria-label={m.periods.pickMonth}
            value={pickedMonth}
            onChange={(e) => {
              const month = e.target.value;
              if (month) update({ period: "custom", from: `${month}-01`, to: monthEnd(month) });
            }}
            className={selectClass(Boolean(pickedMonth))}
          >
            <option value="" disabled={Boolean(pickedMonth)}>
              {m.periods.pickMonth}
            </option>
            {months.map((month) => (
              <option key={month} value={month}>
                {f.monthLongYear(month)}
              </option>
            ))}
          </select>
          {chevron(Boolean(pickedMonth))}
        </div>
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
