"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar, initial } from "@/components/list-row";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import type { LiveSale } from "@/lib/data";
import { cn } from "@/lib/utils";

const POLL_MS = 10_000;
const SHOWN = 5;

/**
 * What just sold, as it happens: the newest sales across the machines, with a
 * new one sliding in on top within seconds of the sync taking it in. When one
 * arrives the page's figures refresh too, so "today" moves along with it.
 * A tab nobody looks at asks for nothing.
 */
export function LiveSales({ initial: first }: { initial: LiveSale[] }) {
  const { m, f } = useI18n();
  const t = m.overview;
  const router = useRouter();
  const [sales, setSales] = useState(first.slice(0, SHOWN));
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
            .slice(0, SHOWN);
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
      <ul className="flex flex-col">
        {sales.map((sale) => {
          const name = sale.productName ?? fmt(m.unassigned.selection, { number: sale.selection ?? "?" });
          const isNew = fresh.has(sale.id);
          return (
            <li
              key={sale.id}
              className={cn(
                "rounded-xl transition-colors duration-[2500ms]",
                isNew ? "bg-positive/10 animate-in fade-in slide-in-from-top-2 duration-500" : "bg-transparent",
              )}
            >
              <Link
                href={`/machines/${sale.machineId}`}
                className="hover-surface flex min-h-14 items-center gap-3 rounded-xl px-3 py-2.5"
              >
                <Avatar tone={isNew ? "positive" : "neutral"}>{initial(name)}</Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold tracking-[-0.01em]">{name}</span>
                  <span className="block truncate text-[13px] text-muted-foreground">
                    {sale.machineName} · {when(sale.occurredAt)}
                  </span>
                </span>
                <span className="tabular shrink-0 text-[15px] font-semibold">{f.euro(sale.amount)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
