"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, MessageCircle, Minus, Plus, Refrigerator, Send, Share2, TrendingDown, TrendingUp } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import type { OrderLine, ProductionList } from "@/lib/data";
import type { ProductionLine } from "@/lib/production";
import { mediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";

/**
 * The kitchen list in the operator's own app (Xin, 19-10-2026: only on the
 * owner's account, and the kitchen types nothing). What to make tonight,
 * biggest first, each with why. "Bestelling doorgeven" writes it down as made
 * and hands the operator a message for the kitchen, instead of the paper.
 * "Koelkast" is the operator's correction when the fridge holds something else.
 */
export function ProductionListView({
  list,
  passOrder,
  countFridge,
}: {
  list: ProductionList;
  passOrder: () => Promise<OrderLine[]>;
  countFridge: (productId: string, qty: number) => Promise<void>;
}) {
  const { m, f } = useI18n();
  const t = m.kitchen;
  const router = useRouter();
  const [order, setOrder] = useState<OrderLine[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const fillAt = new Date(list.fillAt);
  const toMake = list.lines.filter((line) => line.make > 0);
  // Needed, but the fridge was never counted: the list asks for a count before it says "make".
  const toCount = list.lines.filter((line) => line.make === 0 && line.inFridge === null && line.need > 0);
  const rest = list.lines.filter((line) => line.make === 0 && !toCount.includes(line));
  const total = toMake.reduce((sum, line) => sum + line.make, 0);
  // What was passed on today: the message can be sent again.
  const passed =
    order ??
    list.lines
      .filter((line) => line.madeToday > 0)
      .map((line) => ({ name: line.name, qty: line.madeToday }))
      .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
  const passedTotal = passed.reduce((sum, line) => sum + line.qty, 0);

  if (list.lines.length === 0) return <p className="surface-card px-5 py-5 text-[15px] text-muted-foreground">{t.empty}</p>;

  function pass() {
    setFailed(false);
    startTransition(async () => {
      try {
        setOrder(await passOrder());
        router.refresh();
      } catch {
        setFailed(true);
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="surface-card flex flex-col gap-4 p-4 sm:p-5">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground first-letter:uppercase">
            {fmt(t.forRound, { day: f.weekdayDay(fillAt), time: f.time(fillAt) })}
          </p>
          <p className="mt-1 text-[24px] font-semibold leading-tight tracking-[-0.02em]">
            {total > 0 ? fmt(t.total, { n: f.number(total) }) : toCount.length > 0 ? t.countFirst : t.totalNone}
          </p>
        </div>
        {total > 0 && (
          <button
            type="button"
            onClick={pass}
            disabled={pending}
            className="flex h-12 items-center justify-center gap-2 rounded-full bg-foreground px-5 text-[15.5px] font-semibold text-background disabled:opacity-50 active:scale-[0.98] sm:w-fit"
          >
            <Send className="size-[18px]" aria-hidden="true" />
            {pending ? t.passing : t.passOrder}
          </button>
        )}
        {failed && <p className="text-[14px] font-medium text-negative">{m.common.error}</p>}
        {passedTotal > 0 && <OrderMessage order={passed} total={passedTotal} day={f.weekdayDay(fillAt)} />}
      </div>

      {toMake.length > 0 && (
        <ul className="flex flex-col gap-3">
          {toMake.map((line) => (
            <DishRow key={line.productId} line={line} countFridge={countFridge} />
          ))}
        </ul>
      )}

      {toCount.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-1 px-1">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#8a6117]">{t.countFirst}</h2>
            <p className="text-[13.5px] leading-snug text-muted-foreground">{t.countFirstHint}</p>
          </div>
          <ul className="flex flex-col gap-2">
            {toCount.map((line) => (
              <DishRow key={line.productId} line={line} countFridge={countFridge} />
            ))}
          </ul>
        </section>
      )}

      {rest.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="px-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{t.notNeeded}</h2>
          <ul className="flex flex-col gap-2">
            {rest.map((line) => (
              <DishRow key={line.productId} line={line} countFridge={countFridge} quiet />
            ))}
          </ul>
        </section>
      )}

      <p className="px-1 text-[13px] leading-snug text-muted-foreground">{t.how}</p>
    </div>
  );
}

/** Today's order as a message for the kitchen: by WhatsApp, the phone's own share, or copied. */
function OrderMessage({ order, total, day }: { order: OrderLine[]; total: number; day: string }) {
  const { m, f } = useI18n();
  const t = m.kitchen;
  const [copied, setCopied] = useState(false);
  const text = [fmt(t.orderTitle, { day }), ...order.map((line) => fmt(t.orderLine, { n: f.number(line.qty), dish: line.name }))].join("\n");

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function share() {
    if (navigator.share) {
      await navigator.share({ text }).catch(() => {});
      return;
    }
    await copy();
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-positive/8 p-3.5">
      <div className="flex flex-col gap-0.5">
        <p className="flex items-center gap-1.5 text-[15px] font-semibold text-positive">
          <Check className="size-4" aria-hidden="true" />
          {fmt(t.passedToday, { n: f.number(total) })}
        </p>
        <p className="text-[13px] leading-snug text-muted-foreground">{t.passedHint}</p>
      </div>
      <pre className="whitespace-pre-wrap rounded-lg bg-card px-3 py-2.5 font-sans text-[14.5px] leading-relaxed">{text}</pre>
      <div className="flex flex-wrap gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(text)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-11 items-center gap-1.5 rounded-full bg-[#25D366] px-4 text-[15px] font-semibold text-white active:scale-[0.98]"
        >
          <MessageCircle className="size-4" aria-hidden="true" />
          {t.whatsapp}
        </a>
        <button
          type="button"
          onClick={share}
          className="flex h-11 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-[15px] font-semibold active:scale-[0.98]"
        >
          <Share2 className="size-4" aria-hidden="true" />
          {t.share}
        </button>
        <button
          type="button"
          onClick={copy}
          className="flex h-11 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-[15px] font-semibold active:scale-[0.98]"
        >
          {copied ? <Check className="size-4 text-positive" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
          {copied ? t.copied : t.copyText}
        </button>
      </div>
    </div>
  );
}

function DishRow({
  line,
  countFridge,
  quiet = false,
}: {
  line: ProductionLine;
  countFridge: (productId: string, qty: number) => Promise<void>;
  quiet?: boolean;
}) {
  const { m, f } = useI18n();
  const t = m.kitchen;
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState(0);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  const why = [
    line.emptyNow > 0 ? fmt(t.emptyNow, { n: line.emptyNow }) : null,
    line.sells > 0 ? fmt(t.sells, { n: line.sells }) : null,
    line.inFridge === null ? t.fridgeUnknown : fmt(t.fridge, { n: line.inFridge }),
  ].filter(Boolean);
  // The batch only explains the number when it rounded it up.
  const roundedUp = line.make > 0 && line.make === line.batchMin && line.need - (line.inFridge ?? 0) < line.batchMin;

  function open() {
    setFailed(false);
    setQty(line.inFridge ?? 0);
    setEditing(true);
  }

  function save() {
    startTransition(async () => {
      try {
        await countFridge(line.productId, qty);
        setEditing(false);
        router.refresh();
      } catch {
        setFailed(true);
      }
    });
  }

  return (
    <li className={cn("surface-card flex flex-col gap-3 p-4", quiet && "bg-card/60")}>
      <div className="flex items-start gap-3.5">
        <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-surface text-[17px] font-bold text-muted-foreground" aria-hidden="true">
          {line.photoPath ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl(line.photoPath)!} alt="" className="max-h-10 max-w-10 object-contain" />
          ) : (
            line.name.charAt(0).toLocaleUpperCase()
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[17px] font-semibold leading-snug tracking-[-0.01em]">{line.name}</span>
          <span className="text-[13.5px] leading-snug text-muted-foreground">{why.join(" · ")}</span>
          {line.trend && (
            <span
              className={cn(
                "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[12.5px] font-semibold",
                line.trend === "up" ? "bg-positive/12 text-positive" : "bg-warning/15 text-[#8a6117]",
              )}
            >
              {line.trend === "up" ? <TrendingUp className="size-3.5" aria-hidden="true" /> : <TrendingDown className="size-3.5" aria-hidden="true" />}
              {line.trend === "up" ? t.trendUp : t.trendDown}
            </span>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
          {line.make > 0 ? (
            <span className="tabular-nums text-[22px] font-bold leading-none tracking-[-0.02em]">{fmt(t.make, { n: f.number(line.make) })}</span>
          ) : line.inFridge === null && line.need > 0 ? (
            <span className="tabular-nums text-[17px] font-semibold leading-none">{fmt(t.needs, { n: f.number(line.need) })}</span>
          ) : (
            <span className="text-[15px] font-medium text-muted-foreground">{t.nothing}</span>
          )}
          {roundedUp && <span className="text-[12.5px] text-muted-foreground">{fmt(t.batch, { n: line.batchMin })}</span>}
        </div>
      </div>

      {editing ? (
        <div className="flex flex-col gap-3 rounded-xl bg-surface p-3">
          <p className="text-[15px] font-semibold">{t.countHow}</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label={t.less}
              onClick={() => setQty((n) => Math.max(0, n - 1))}
              className="grid size-14 place-items-center rounded-2xl border border-input bg-card active:scale-95"
            >
              <Minus className="size-6" />
            </button>
            <span className="tabular-nums min-w-14 text-center text-[30px] font-bold" aria-live="polite">
              {qty}
            </span>
            <button
              type="button"
              aria-label={t.more}
              onClick={() => setQty((n) => Math.min(9999, n + 1))}
              className="grid size-14 place-items-center rounded-2xl border border-input bg-card active:scale-95"
            >
              <Plus className="size-6" />
            </button>
          </div>
          {failed && <p className="text-[14px] font-medium text-negative">{m.common.error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={save}
              className="h-12 flex-1 rounded-full bg-foreground text-[15.5px] font-semibold text-background disabled:opacity-50 active:scale-[0.98]"
            >
              {t.save}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setEditing(false)}
              className="h-12 rounded-full px-5 text-[15.5px] font-semibold text-muted-foreground active:scale-[0.98]"
            >
              {t.cancel}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={open}
            className="flex h-10 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-[14.5px] font-semibold active:scale-[0.98]"
          >
            <Refrigerator className="size-4" aria-hidden="true" />
            {t.count}
          </button>
          {line.madeToday > 0 && (
            <span className="inline-flex items-center gap-1 text-[14px] font-semibold text-positive">
              <Check className="size-4" aria-hidden="true" />
              {fmt(t.orderedToday, { n: line.madeToday })}
            </span>
          )}
        </div>
      )}
    </li>
  );
}
