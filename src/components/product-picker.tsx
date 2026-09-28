"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
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

  const exactMatch = products.some((p) => normalize(p.name) === normalize(query));
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
        onClick={() => {
          setOpen((o) => !o);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className={cn(
          "flex h-10 w-full items-center gap-2 border border-input bg-card px-3 text-left text-sm transition-colors hover:border-primary disabled:opacity-50",
          open && "border-primary",
        )}
      >
        {selected?.photo_path && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrl(selected.photo_path)!} alt="" className="size-6 object-contain" />
        )}
        <span className={cn("flex-1 truncate", !selected && "text-muted-foreground")}>
          {selected?.name ?? placeholder ?? m.products.searchPlaceholder}
        </span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 border bg-popover shadow-[0_18px_40px_rgb(28_24_18/0.16)]">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              if (e.key === "Enter") {
                e.preventDefault();
                if (matches.length > 0 && (exactMatch || !canCreate)) choose(matches[0].id);
                else if (canCreate) void create();
              }
            }}
            placeholder={m.products.searchPlaceholder}
            className="h-11 w-full border-b bg-transparent px-3 text-base outline-none md:text-sm"
          />
          <ul className="max-h-64 overflow-y-auto py-1">
            {allowNone && (
              <li>
                <button
                  type="button"
                  onClick={() => choose(null)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent"
                >
                  {noneLabel ?? m.common.none}
                </button>
              </li>
            )}
            {matches.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => choose(p.id)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  <span className="grid size-7 shrink-0 place-items-center">
                    {p.photo_path && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={mediaUrl(p.photo_path)!} alt="" className="max-h-7 max-w-7 object-contain" />
                    )}
                  </span>
                  <span className="flex-1 truncate">{p.name}</span>
                  {p.id === value && <Check className="size-4 text-primary" />}
                </button>
              </li>
            ))}
            {matches.length === 0 && !canCreate && (
              <li className="px-3 py-2 text-sm text-muted-foreground">{m.products.noResults}</li>
            )}
            {canCreate && (
              <li>
                <button
                  type="button"
                  onClick={() => void create()}
                  disabled={creating}
                  className="flex w-full items-center gap-2 border-t px-3 py-2.5 text-left text-sm font-semibold text-accent-foreground hover:bg-accent"
                >
                  <Plus className="size-4" />
                  {fmt(m.products.createNamed, { name: query.trim() })}
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
