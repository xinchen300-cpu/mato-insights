"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Home, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { duration, fmt } from "@/i18n/format";
import type { RouteTimes } from "@/lib/data";
import { driveMinutes } from "@/lib/filler-stats";
import { legKey } from "@/lib/round-settings";
import { cn } from "@/lib/utils";
import { saveRoute } from "../actions";

/**
 * The route as a flowchart: from the depot, past every machine in order, and
 * back. The owner moves a stop up or down and writes the kilometres on each
 * line; the measured drive time stands next to it. Every round's kilometres
 * are added up from these, so the filler never has to know them.
 */
export function RouteEditor({
  machines,
  legs,
  times,
}: {
  /** In the order of the route. */
  machines: { id: string; name: string }[];
  /** Kilometres per pair of stops (legKey). */
  legs: Record<string, number>;
  times: RouteTimes;
}) {
  const { m, f } = useI18n();
  const t = m.route;
  const router = useRouter();
  const [order, setOrder] = useState(() => machines.map((machine) => machine.id));
  const [km, setKm] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(legs).map(([key, value]) => [key, f.number(value)])),
  );
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [busy, startTransition] = useTransition();
  const nameOf = new Map(machines.map((machine) => [machine.id, machine.name]));
  const label = (stop: string) => (stop === "start" ? t.depart : stop === "end" ? t.back : (nameOf.get(stop) ?? "—"));

  const stops = ["start", ...order, "end"];
  const lines = stops.slice(1).map((to, index) => ({ from: stops[index], to, key: legKey(stops[index], to) }));
  /** A typed distance as a number, null when empty, NaN when it is no distance. */
  const read = (text: string | undefined) => {
    if (!text?.trim()) return null;
    const value = Number(text.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(value) && value > 0 && value <= 1000 ? value : NaN;
  };
  const known = lines.map((line) => read(km[line.key]));
  const total = known.every((value) => value !== null && !Number.isNaN(value))
    ? Math.round((known as number[]).reduce((sum, value) => sum + value, 0) * 10) / 10
    : null;

  function move(id: string, by: -1 | 1) {
    setStatus("idle");
    setOrder((current) => {
      const from = current.indexOf(id);
      const to = from + by;
      if (from < 0 || to < 0 || to >= current.length) return current;
      const next = [...current];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  }

  function save() {
    setStatus("idle");
    const sent = Object.fromEntries(
      lines.map((line, index) => {
        const value = known[index];
        return [line.key, value === null || Number.isNaN(value) ? null : value];
      }),
    );
    startTransition(async () => {
      try {
        await saveRoute(order, sent);
        setStatus("saved");
        router.refresh();
      } catch {
        setStatus("error");
      }
    });
  }

  if (machines.length === 0) return <p className="surface-card p-6 text-[15px] text-muted-foreground">{t.empty}</p>;

  return (
    <div className="flex max-w-xl flex-col gap-5">
      <ol className="surface-card flex flex-col px-4 py-5 sm:px-6">
        {stops.map((stop, index) => {
          const depot = stop === "start" || stop === "end";
          const line = lines[index];
          const drive = line ? driveMinutes(times.legs, line.from, line.to) : null;
          const typed = line ? read(km[line.key]) : null;
          return (
            <li key={`${stop}-${index}`} className="flex flex-col">
              {/* A stop: the depot at both ends, a numbered machine in between. */}
              <div className="flex min-h-12 items-center gap-3">
                <span
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-full text-[15px] font-bold",
                    depot ? "bg-surface text-foreground" : "bg-foreground text-background",
                  )}
                  aria-hidden="true"
                >
                  {depot ? <Home className="size-[18px]" /> : index}
                </span>
                <span className={cn("min-w-0 flex-1 truncate text-[16px]", depot ? "font-medium text-muted-foreground" : "font-semibold")}>
                  {label(stop)}
                </span>
                {!depot && (
                  <span className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      onClick={() => move(stop, -1)}
                      disabled={index === 1}
                      aria-label={`${m.refill.moveEarlier}: ${label(stop)}`}
                      className="grid size-10 place-items-center rounded-full bg-surface transition-transform active:scale-95 disabled:opacity-30"
                    >
                      <ChevronUp className="size-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(stop, 1)}
                      disabled={index === order.length}
                      aria-label={`${m.refill.moveLater}: ${label(stop)}`}
                      className="grid size-10 place-items-center rounded-full bg-surface transition-transform active:scale-95 disabled:opacity-30"
                    >
                      <ChevronDown className="size-5" />
                    </button>
                  </span>
                )}
              </div>
              {/* The line to the next stop: its kilometres, and how long the drive took before. */}
              {line && (
                <div className="flex items-center gap-3">
                  <span className="flex w-10 shrink-0 justify-center self-stretch" aria-hidden="true">
                    <span className="w-[3px] rounded-full bg-border" />
                  </span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                    <label className="flex items-center gap-2">
                      <input
                        inputMode="decimal"
                        value={km[line.key] ?? ""}
                        onChange={(event) => {
                          setStatus("idle");
                          setKm((all) => ({ ...all, [line.key]: event.target.value.replace(/[^0-9.,\s]/g, "") }));
                        }}
                        aria-label={fmt(t.kmLabel, { from: label(line.from), to: label(line.to) })}
                        className={cn(
                          "tabular h-10 w-20 rounded-xl border bg-card px-3 text-right text-[15px] font-semibold outline-none focus:ring-2 focus:ring-ring/40",
                          Number.isNaN(typed) ? "border-negative" : "border-input",
                        )}
                      />
                      <span className="text-[14px] font-medium text-muted-foreground">km</span>
                    </label>
                    {drive !== null && (
                      <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                        <Truck className="size-4" aria-hidden="true" />
                        {fmt(m.round.drive, { time: duration(Math.max(1, drive), m.refill.runTime, m.refill.runTimeHours) })}
                      </span>
                    )}
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-col gap-1 px-1">
        <p className="tabular text-[17px] font-semibold">{total !== null ? fmt(t.total, { km: f.number(total) }) : t.totalMissing}</p>
        <p className="text-[13.5px] text-muted-foreground">{t.hint}</p>
      </div>

      <div className="flex items-center gap-3">
        <Button size="lg" onClick={save} disabled={busy || known.some((value) => Number.isNaN(value))}>
          {busy ? m.common.saving : t.save}
        </Button>
        {status === "saved" && !busy && <span className="text-sm font-medium text-positive">{m.common.saved}</span>}
        {status === "error" && <span className="text-sm font-medium text-negative">{m.common.error}</span>}
      </div>
    </div>
  );
}
