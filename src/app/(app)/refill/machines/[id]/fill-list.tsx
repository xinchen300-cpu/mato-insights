"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleCheck, ClipboardList, ListChecks } from "lucide-react";
import { SavedCheck } from "@/components/saved-check";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { fmt, plural } from "@/i18n/format";
import { haptic } from "@/lib/haptics";
import { mediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";
import { refillFromList } from "../../actions";

/** One product the machine misses: how many in total, in which slots. */
export type FillItem = { productId: string; name: string; photoPath: string | null; take: number; slots: { selection: string; take: number }[] };

/** How long the ticks of an unfinished list are kept on this phone: a refill is the same morning. */
const KEEP_MS = 12 * 60 * 60 * 1000;
const storageKey = (machineId: string) => `mato:fill-list:${machineId}`;

/** What is ticked, on this phone, for the morning; nothing ticked forgets the list. */
function remember(machineId: string, ticked: Set<string>) {
  try {
    if (ticked.size) localStorage.setItem(storageKey(machineId), JSON.stringify({ at: Date.now(), ticked: [...ticked] }));
    else localStorage.removeItem(storageKey(machineId));
  } catch {
    // Not kept, still ticked.
  }
}

/**
 * "Vullijst maken" on a machine's own page (Xin, 22-10-2026: in place of "Vul deze automaat"): everything this
 * machine misses, one line per product, ticked off as it goes into the box, then "Automaat hervuld" at the machine
 * puts every ticked slot at full and the stock with it. No round: one machine, one list. The ticks survive a reload on
 * this phone for the morning, so packing at the depot and filling at the machine can be two visits to the page.
 */
export function FillList({ machineId, items }: { machineId: string; items: FillItem[] }) {
  const { m } = useI18n();
  const t = m.refill;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [toast, setToast] = useState<number | null>(null);
  const [busy, startTransition] = useTransition();

  // A list started earlier this morning on this phone opens as it was left.
  // Read after the first paint: the server cannot know what this phone kept.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey(machineId)) ?? "null") as { at: number; ticked: string[] } | null;
      if (saved && Date.now() - saved.at < KEEP_MS) {
        const known = new Set(items.map((item) => item.productId));
        setTicked(new Set(saved.ticked.filter((id) => known.has(id))));
        setOpen(true);
      }
    } catch {
      // No storage (a private window): the list just starts empty.
    }
  }, [machineId, items]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (toast === null) return;
    const timer = window.setTimeout(() => setToast(null), 2000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function toggle(productId: string) {
    haptic();
    setFailed(false);
    const next = new Set(ticked);
    if (next.has(productId)) next.delete(productId);
    else next.add(productId);
    remember(machineId, next);
    setTicked(next);
  }

  function all(on: boolean) {
    haptic();
    const next = new Set(on ? items.map((item) => item.productId) : []);
    remember(machineId, next);
    setTicked(next);
  }

  function refilled() {
    setFailed(false);
    const selections = items.filter((item) => ticked.has(item.productId)).flatMap((item) => item.slots.map((slot) => slot.selection));
    startTransition(async () => {
      try {
        const filled = await refillFromList(machineId, selections);
        haptic("success");
        remember(machineId, new Set());
        setTicked(new Set());
        setOpen(false);
        setDone(filled);
        setToast(filled);
        router.refresh();
      } catch {
        setFailed(true);
      }
    });
  }

  const total = items.reduce((sum, item) => sum + item.take, 0);
  const takenPieces = items.filter((item) => ticked.has(item.productId)).reduce((sum, item) => sum + item.take, 0);
  const everything = ticked.size === items.length;

  return (
    <div className="flex flex-col gap-3">
      {toast !== null && <SavedCheck text={plural(toast, t.refilledOne, t.refilledMany)} onClose={() => setToast(null)} />}
      {done !== null && !open && (
        <p role="status" className="flex items-center gap-1.5 text-[15px] font-semibold text-positive">
          <CircleCheck className="size-5 shrink-0" aria-hidden="true" />
          {t.refilledNote}
        </p>
      )}
      {items.length === 0 ? (
        !done && <p className="text-[15px] text-muted-foreground">{t.machineOk}</p>
      ) : !open ? (
        <Button size="lg" onClick={() => setOpen(true)}>
          <ClipboardList />
          {t.makeList}
        </Button>
      ) : (
        <section className="surface-card flex flex-col gap-3 p-4" aria-label={t.listTitle}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[18px] font-semibold tracking-[-0.02em]">{t.listTitle}</h2>
              <p className="mt-0.5 text-[13.5px] text-muted-foreground">{t.listHint}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => all(!everything)} className="shrink-0">
              <ListChecks />
              {everything ? t.tickNone : t.tickAll}
            </Button>
          </div>
          <ul className="flex flex-col">
            {items.map((item) => {
              const on = ticked.has(item.productId);
              const src = mediaUrl(item.photoPath);
              return (
                <li key={item.productId} className="border-b border-border/60 last:border-0">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggle(item.productId)}
                    className="flex min-h-[64px] w-full items-center gap-3 py-2 text-left transition-transform active:scale-[0.99]"
                  >
                    <span
                      className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-lg border-2 transition-colors",
                        on ? "border-positive bg-positive text-white" : "border-input bg-background",
                      )}
                      aria-hidden="true"
                    >
                      {on && <Check className="size-5" strokeWidth={3} />}
                    </span>
                    {src && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={src} alt="" loading="lazy" className="size-10 shrink-0 rounded-lg bg-surface object-cover" />
                    )}
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className={cn("truncate text-[16px] font-semibold", on && "text-muted-foreground line-through decoration-2")}>
                        {item.name}
                      </span>
                      <span className="tabular truncate text-[13px] text-muted-foreground">
                        {fmt(m.fillList.slots, { slots: item.slots.map((slot) => slot.selection).join(" · ") })}
                      </span>
                    </span>
                    <span className={cn("tabular w-12 shrink-0 text-right text-[22px] font-bold tracking-[-0.02em]", on && "text-muted-foreground")}>
                      {item.take}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {/* Clears the tab bar on phones, the iPhone's home bar included. */}
          <div className="surface-card sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 flex flex-col gap-2 bg-card p-3 lg:bottom-4">
            <p className="tabular px-1 text-[14px] font-medium text-muted-foreground">
              {fmt(t.listTicked, { n: takenPieces, total })}
            </p>
            <Button size="lg" onClick={refilled} disabled={busy || ticked.size === 0} className="h-14 w-full text-[17px]">
              <Check />
              {busy ? m.common.saving : t.refilledButton}
            </Button>
            {failed && (
              <p role="alert" className="px-1 text-[14px] text-destructive">
                {m.common.error}
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
