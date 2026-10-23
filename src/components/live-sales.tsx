"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Avatar, initial } from "@/components/list-row";
import { RollingNumber } from "@/components/motion/rolling-number";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { RecordingHint, RecordingLink } from "@/components/recording-link";
import type { LinkedCamera } from "@/lib/camera-link";
import type { LiveSale } from "@/lib/data";
import { addDays, isoDay } from "@/lib/expiry";
import { cn } from "@/lib/utils";

const POLL_MS = 10_000;
const SHOWN = 5;
/** "Meer zien" opens this many, day by day (Xin, 19-10-2026). */
const MORE = 40;

/**
 * What just sold, as it happens: the newest sales across the machines, with a
 * new one sliding in on top within seconds of the sync taking it in. When one
 * arrives the page's figures refresh too, so "today" moves along with it.
 * "Meer zien" opens the longer list, under a heading per day. A tab nobody
 * looks at asks for nothing.
 */
export function LiveSales({
  initial: first,
  cameras = {},
}: {
  initial: LiveSale[];
  /** The machines with a UniFi camera: each of their sales opens its recording (the operator's alone). */
  cameras?: Record<string, LinkedCamera[]>;
}) {
  const { m, f } = useI18n();
  const t = m.overview;
  const router = useRouter();
  const [sales, setSales] = useState(first.slice(0, MORE));
  const [open, setOpen] = useState(false);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [now, setNow] = useState<number | null>(null);
  // Arrival time of the newest sale seen: what came in after it is news.
  const cursor = useRef(first.reduce((latest, sale) => (sale.createdAt > latest ? sale.createdAt : latest), ""));

  useEffect(() => {
    let alive = true;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const clock = setInterval(tick, 30_000);

    async function poll() {
      if (document.visibilityState !== "visible") return;
      try {
        const after = cursor.current ? `?after=${encodeURIComponent(cursor.current)}` : "";
        const res = await fetch(`/api/live-sales${after}`, { cache: "no-store" });
        if (!res.ok || !alive) return;
        const { sales: incoming } = (await res.json()) as { sales: LiveSale[] };
        if (!incoming.length || !alive) return;
        cursor.current = incoming.reduce(
          (latest, sale) => (sale.createdAt > latest ? sale.createdAt : latest),
          cursor.current,
        );
        setSales((shown) => {
          const ids = new Set(shown.map((sale) => sale.id));
          return [...incoming.filter((sale) => !ids.has(sale.id)), ...shown]
            .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
            .slice(0, MORE);
        });
        setFresh(new Set(incoming.map((sale) => sale.id)));
        setTimeout(() => alive && setFresh(new Set()), 4000);
        tick();
        // Today's total and the curve follow the new sale.
        router.refresh();
      } catch {
        // Offline for a moment: the next poll catches up.
      }
    }
    const timer = setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(clock);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [router]);

  if (sales.length === 0) return null;

  const when = (at: string) => {
    if (now === null) return f.time(at);
    const minutes = Math.floor((now - new Date(at).getTime()) / 60000);
    if (minutes < 1) return t.liveSalesJustNow;
    if (minutes < 60) return fmt(t.liveSalesMinutes, { n: minutes });
    return f.time(at);
  };
  const dayOf = (at: string) => {
    const day = isoDay(new Date(at));
    return day === isoDay(new Date()) ? m.periods.today : day === addDays(-1) ? t.yesterday : f.weekdayDay(at);
  };
  const shown = open ? sales : sales.slice(0, SHOWN);

  return (
    <section className="surface-card flex flex-col p-2 sm:p-3">
      <div className="flex items-center justify-between px-3 pb-1 pt-2">
        <h2 className="text-[16px] font-semibold tracking-[-0.02em]">{t.liveSalesTitle}</h2>
        <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-positive">
          <span className="relative flex size-2" aria-hidden="true">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-positive opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-positive" />
          </span>
          {t.liveSalesBadge}
        </span>
      </div>
      {Object.keys(cameras).length > 0 && <RecordingHint text={m.machines.cameraOnComputer} className="px-3 pb-1" />}
      <ul className="flex flex-col">
        {shown.map((sale, index) => {
          const name = sale.productName ?? fmt(m.unassigned.selection, { number: sale.selection ?? "?" });
          const isNew = fresh.has(sale.id);
          // In the long list, a heading where a new day begins.
          const heading = open && (index === 0 || dayOf(shown[index - 1].occurredAt) !== dayOf(sale.occurredAt)) ? dayOf(sale.occurredAt) : null;
          return (
            <li
              key={sale.id}
              className={cn(
                "rounded-xl transition-colors duration-[2500ms]",
                isNew ? "bg-positive/10 animate-in fade-in slide-in-from-top-2 duration-500" : "bg-transparent",
              )}
            >
              {heading && <p className="px-3 pb-1 pt-3 text-[13px] font-semibold text-muted-foreground">{heading}</p>}
              <div className="flex items-center gap-1">
                <Link
                  href={`/machines/${sale.machineId}`}
                  className="hover-surface flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2.5"
                >
                  <Avatar tone={isNew ? "positive" : "neutral"}>{initial(name)}</Avatar>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold tracking-[-0.01em]">{name}</span>
                    <span className="block truncate text-[13px] text-muted-foreground">
                      {open ? f.time(sale.occurredAt) : when(sale.occurredAt)} · {sale.machineName}
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-[15px] font-semibold">
                    {isNew ? <RollingNumber value={f.euro(sale.amount)} /> : f.euro(sale.amount)}
                  </span>
                </Link>
                <RecordingLink
                  cameras={cameras[sale.machineId] ?? []}
                  at={sale.occurredAt}
                  label={fmt(m.machines.cameraWatchAt, { time: f.time(sale.occurredAt) })}
                  unnamed={m.machines.cameraUnnamed}
                />
              </div>
            </li>
          );
        })}
      </ul>
      {sales.length > SHOWN && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="mx-1 mt-1 flex h-11 items-center justify-center gap-1.5 rounded-xl text-[14.5px] font-semibold text-muted-foreground hover:bg-surface"
        >
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
          {open ? t.liveSalesLess : fmt(t.liveSalesMore, { n: sales.length - SHOWN })}
        </button>
      )}
    </section>
  );
}
