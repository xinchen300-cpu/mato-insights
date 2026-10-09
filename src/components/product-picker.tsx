"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import { Avatar, initial } from "@/components/list-row";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { mediaUrl } from "@/lib/media";
import type { Product } from "@/lib/types";

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();

export function ProductPicker({
  products,
  value,
  onSelect,
  onCreate,
  placeholder,
  allowNone = false,
  noneLabel,
  disabled = false,
}: {
  products: Product[];
  value: string | null;
  onSelect: (productId: string | null) => void;
  onCreate?: (name: string) => Promise<void>;
  placeholder?: string;
  allowNone?: boolean;
  noneLabel?: string;
  disabled?: boolean;
}) {
  const { m } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = products.find((p) => p.id === value) ?? null;

  const matches = useMemo(() => {
    const q = normalize(query);
    const list = q ? products.filter((p) => normalize(p.name).includes(q)) : products;
    return list.slice(0, 60);
  }, [products, query]);

  // The product whose name IS what was typed, not merely one that contains it:
  // typing "Rijst" must not link "Gebakken Rijst" because it sorts first.
  const exact = products.find((p) => normalize(p.name) === normalize(query));
  const exactMatch = Boolean(exact);
  const canCreate = Boolean(onCreate && query.trim() && !exactMatch);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function choose(id: string | null) {
    onSelect(id);
    setOpen(false);
    setQuery("");
  }

  async function create() {
    if (!onCreate || !query.trim()) return;
    setCreating(true);
    try {
      await onCreate(query.trim());
      setOpen(false);
      setQuery("");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        type="button"
        disabled={disabled || creating}
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className={cn(
          "flex h-11 w-full items-center gap-2.5 rounded-xl border border-input bg-card px-3.5 text-left text-base outline-none transition-[border-color,box-shadow,background-color] duration-150 hover:bg-surface/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 disabled:opacity-50 md:text-sm",
          open && "border-ring ring-3 ring-ring/25",
        )}
      >
        {selected?.photo_path && (
          <span className="-ml-1.5 grid size-7 shrink-0 place-items-center overflow-hidden rounded-full bg-surface">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mediaUrl(selected.photo_path)!} alt="" className="max-h-5 max-w-5 object-contain" />
          </span>
        )}
        <span className={cn("flex-1 truncate", !selected && "text-muted-foreground")}>
          {selected?.name ?? placeholder ?? m.products.searchPlaceholder}
        </span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-150", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl bg-popover shadow-[0_0_0_1px_var(--border),var(--shadow-pop)]">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              if (e.key === "Enter") {
                e.preventDefault();
                if (exact) choose(exact.id);
                else if (matches.length > 0 && !canCreate) choose(matches[0].id);
                else if (canCreate) void create();
              }
            }}
            placeholder={m.products.searchPlaceholder}
            className="h-12 w-full border-b bg-transparent px-4 text-base outline-none placeholder:text-muted-foreground md:text-sm"
          />
          <ul className="max-h-72 overflow-y-auto p-1.5">
            {allowNone && (
              <li>
                <button
                  type="button"
                  onClick={() => choose(null)}
                  className="hover-surface flex min-h-11 w-full items-center gap-3 rounded-xl px-2.5 py-1.5 text-left text-[15px] text-muted-foreground md:text-sm"
                >
                  <span className="size-8 shrink-0" aria-hidden="true" />
                  {noneLabel ?? m.common.none}
                </button>
              </li>
            )}
            {matches.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => choose(p.id)}
                  className="hover-surface flex min-h-11 w-full items-center gap-3 rounded-xl px-2.5 py-1.5 text-left text-[15px] md:text-sm"
                >
                  <Avatar className="size-8 overflow-hidden text-[13px]">
                    {p.photo_path ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={mediaUrl(p.photo_path)!} alt="" className="max-h-6 max-w-6 object-contain" />
                    ) : (
                      initial(p.name)
                    )}
                  </Avatar>
                  <span className="flex-1 truncate">{p.name}</span>
                  {p.id === value && <Check className="size-4 shrink-0 text-primary" />}
                </button>
              </li>
            ))}
            {matches.length === 0 && !canCreate && (
              <li className="px-3 py-3 text-sm text-muted-foreground">{m.products.noResults}</li>
            )}
            {canCreate && (
              <li className={cn((allowNone || matches.length > 0) && "mt-1 border-t pt-1")}>
                <button
                  type="button"
                  onClick={() => void create()}
                  disabled={creating}
                  className="hover-surface flex min-h-11 w-full items-center gap-3 rounded-xl px-2.5 py-1.5 text-left text-[15px] font-semibold disabled:opacity-50 md:text-sm"
                >
                  <Avatar tone="gold" className="size-8 [&_svg]:size-4">
                    <Plus />
                  </Avatar>
                  <span className="min-w-0 flex-1 break-words">{fmt(m.products.createNamed, { name: query.trim() })}</span>
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
