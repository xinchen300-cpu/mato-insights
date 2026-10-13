"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronRight, Plus, Search, X } from "lucide-react";
import { FrontView, type FrontSlot } from "@/components/machine/front-view";
import { Avatar, initial } from "@/components/list-row";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { mediaUrl } from "@/lib/media";
import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";

const normalize = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

/**
 * The machine as it stands, where a tap on a slot opens the list of products
 * and a tap on a product puts it in: saved at once, and the next slot comes
 * up, so a whole machine is filled in a minute. The products this machine
 * already sells come first.
 */
export function SlotProducts({
  rows: initialRows,
  products: initialProducts,
  showStock = true,
  hint,
  extra,
  onAssign,
  onCreate,
}: {
  rows: FrontSlot[][];
  products: Product[];
  showStock?: boolean;
  /** The line under the machine; by default it says a tap saves at once. */
  hint?: string;
  /** More for the open slot, above the list (who owns it, on a shared fridge). */
  extra?: (slot: FrontSlot) => React.ReactNode;
  /** Saves one slot; throws when it did not. */
  onAssign: (selection: string, productId: string | null) => Promise<void>;
  /** Makes a product for this machine and returns it. */
  onCreate: (name: string) => Promise<Product>;
}) {
  const { m } = useI18n();
  // What was just picked, shown at once; the server's rows underneath catch up.
  const [picked, setPicked] = useState<Record<string, Pick<FrontSlot, "productId" | "productName" | "photoUrl">>>({});
  const rows = useMemo(
    () => initialRows.map((row) => row.map((slot) => (picked[slot.key] ? { ...slot, ...picked[slot.key] } : slot))),
    [initialRows, picked],
  );
  const [products, setProducts] = useState(initialProducts.filter((p) => !p.archived));
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const search = useRef<HTMLInputElement>(null);

  const order = useMemo(() => rows.flat(), [rows]);
  const open = order.find((slot) => slot.key === openKey) ?? null;
  const next = open ? (order[order.findIndex((slot) => slot.key === open.key) + 1] ?? null) : null;

  // What this machine already holds comes first, most used first; then the rest.
  const sorted = useMemo(() => {
    const uses = new Map<string, number>();
    for (const slot of order) if (slot.productId) uses.set(slot.productId, (uses.get(slot.productId) ?? 0) + 1);
    return [...products].sort((a, b) => (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0) || a.name.localeCompare(b.name));
  }, [products, order]);
  const q = normalize(query);
  const shown = q ? sorted.filter((p) => normalize(p.name).includes(q)) : sorted;
  const exact = products.some((p) => normalize(p.name) === q);

  function openSlot(key: string | null) {
    setOpenKey(key);
    setQuery("");
    setError(null);
  }

  // A keyboard pops up on a phone and hides the list, so only a mouse gets the cursor.
  useEffect(() => {
    if (open && window.matchMedia("(pointer: fine)").matches) search.current?.focus();
  }, [open]);

  function place(slot: FrontSlot, product: Product | null) {
    const was = picked[slot.key];
    setPicked((all) => ({
      ...all,
      [slot.key]: {
        productId: product?.id ?? null,
        productName: product?.name ?? null,
        photoUrl: mediaUrl(product?.photo_path),
      },
    }));
    openSlot(next?.key ?? null);
    startTransition(async () => {
      try {
        await onAssign(slot.selection, product?.id ?? null);
      } catch {
        setPicked((all) => {
          const rest = { ...all };
          delete rest[slot.key];
          return was ? { ...rest, [slot.key]: was } : rest;
        });
        setOpenKey(slot.key);
        setError(fmt(m.layout.assignFailed, { number: slot.selection }));
      }
    });
  }

  function create(slot: FrontSlot) {
    const name = query.trim();
    if (!name) return;
    startTransition(async () => {
      try {
        const product = await onCreate(name);
        setProducts((list) => [...list, product]);
        place(slot, product);
      } catch {
        setError(m.common.error);
      }
    });
  }

  return (
    <>
      <FrontView
        rows={rows}
        showStock={showStock}
        selectedKey={openKey}
        onSlotClick={(slot) => openSlot(slot.key === openKey ? null : slot.key)}
      />
      <p className="mt-3 px-1 text-[13px] text-muted-foreground">{hint ?? m.layout.tapSlot}</p>

      {/* Into the body: the page's entry animation leaves a transform behind,
          and a fixed sheet inside it would sit at the bottom of the page. */}
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center"
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              aria-label={m.common.close}
              className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]"
              onClick={() => openSlot(null)}
            />
            <div className="relative flex max-h-[88svh] w-full max-w-lg flex-col rounded-t-3xl bg-background shadow-2xl sm:rounded-3xl">
              <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-muted-foreground">
                    {fmt(m.layout.slotTitle, { number: open.selection })}
                  </p>
                  <p className="truncate text-[20px] font-semibold tracking-[-0.02em]">
                    {open.productName ?? m.layout.noProduct}
                  </p>
                  {open.info && <p className="mt-0.5 text-[14px] text-muted-foreground">{open.info}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => openSlot(null)}
                  aria-label={m.common.close}
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-surface"
                >
                  <X className="size-5" />
                </button>
              </div>

              <div className="px-5 pb-3">
                {extra?.(open)}
                <label className="flex h-12 items-center gap-2.5 rounded-2xl border border-input bg-card px-4">
                  <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <input
                    ref={search}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      if (shown.length === 1) place(open, shown[0]);
                      else if (!exact && query.trim()) create(open);
                    }}
                    placeholder={m.layout.searchProduct}
                    aria-label={m.layout.searchProduct}
                    className="min-w-0 flex-1 bg-transparent text-[16px] outline-none"
                  />
                </label>
                {error && <p className="mt-2 text-[13.5px] font-medium text-negative">{error}</p>}
              </div>

              <ul className="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
                {query.trim() && !exact && (
                  <li>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => create(open)}
                      className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-2 text-left hover:bg-surface"
                    >
                      <Avatar tone="positive">
                        <Plus />
                      </Avatar>
                      <span className="text-[15px] font-semibold">
                        {fmt(m.layout.newProduct, { name: query.trim() })}
                      </span>
                    </button>
                  </li>
                )}
                {shown.map((product) => {
                  const current = product.id === open.productId;
                  return (
                    <li key={product.id}>
                      <button
                        type="button"
                        onClick={() => place(open, product)}
                        className={cn(
                          "flex min-h-14 w-full items-center gap-3 rounded-2xl px-2 text-left hover:bg-surface",
                          current && "bg-surface",
                        )}
                      >
                        {product.photo_path ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={mediaUrl(product.photo_path)!}
                            alt=""
                            className="size-10 shrink-0 rounded-xl object-contain"
                          />
                        ) : (
                          <Avatar>{initial(product.name)}</Avatar>
                        )}
                        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{product.name}</span>
                        {current && <Check className="size-5 shrink-0" />}
                      </button>
                    </li>
                  );
                })}
                {open.productId && !query.trim() && (
                  <li>
                    <button
                      type="button"
                      onClick={() => place(open, null)}
                      className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-2 text-left text-[14.5px] font-medium text-muted-foreground hover:bg-surface"
                    >
                      {m.layout.clearSlot}
                    </button>
                  </li>
                )}
              </ul>

              <div className="flex items-center justify-between gap-3 border-t px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <button
                  type="button"
                  onClick={() => openSlot(null)}
                  className="h-11 rounded-full px-4 text-[15px] font-semibold text-muted-foreground"
                >
                  {m.layout.done}
                </button>
                {next && (
                  <button
                    type="button"
                    onClick={() => openSlot(next.key)}
                    className="flex h-11 items-center gap-1 rounded-full bg-surface px-4 text-[15px] font-semibold"
                  >
                    {fmt(m.layout.nextSlot, { number: next.selection })}
                    <ChevronRight className="size-4" />
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
