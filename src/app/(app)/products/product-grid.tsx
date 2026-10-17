"use client";

import { useState, useTransition, type ComponentProps, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ChevronDown, Package, Plus, Search } from "lucide-react";
import { ImagePicker } from "@/components/image-picker";
import { Avatar, RowList, initial } from "@/components/list-row";
import { PageHeader, Section } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { mediaUrl } from "@/lib/media";
import { CUSTOM_SHELF_LIFE } from "@/lib/expiry";
import type { Product, ShelfLifePreset } from "@/lib/types";
import { cn } from "@/lib/utils";
import { saveProduct, setProductArchived } from "./actions";

type BusinessOption = { id: string; name: string };

const NO_BUSINESS = "none";

const normalize = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

// A form select that matches Input: same height, radius, hairline and focus ring.
const fieldSelectClass =
  "h-11 w-full cursor-pointer appearance-none rounded-xl border border-input bg-card pl-3.5 pr-10 text-base outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 md:text-sm";

// A filter pill: soft grey at rest, near-black once it narrows the list.
const pillClass =
  "inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-full text-base font-medium outline-none transition-[background-color,color,box-shadow] duration-150 md:h-9 md:text-[13.5px]";
const pillIdle = "bg-surface text-foreground hover:bg-[#e6e6e9]";
const pillActive = "bg-foreground text-background";

export function ProductGrid({
  products,
  businesses,
  initialBusiness = "",
  presets,
  title,
  subtitle,
  actions,
  notice,
}: {
  products: Product[];
  businesses: BusinessOption[];
  initialBusiness?: string;
  presets: ShelfLifePreset[];
  /** The page header lives here so "add" can sit next to the page's other actions. */
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** Shown between the header and the list, e.g. the unassigned-selections row. */
  notice?: ReactNode;
}) {
  const { m, f } = useI18n();
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  // "" is every business, NO_BUSINESS the products nobody claimed yet.
  const [business, setBusiness] = useState(initialBusiness);
  // Finding one product in a long list is what this page is for.
  const [query, setQuery] = useState("");
  const q = normalize(query);

  const businessName = new Map(businesses.map((b) => [b.id, b.name]));
  // An operator without shops that rent slots has no use for "business" at all.
  const hasBusinesses = businesses.length > 0;
  const presetDays = new Map(presets.map((p) => [p.id, p.days]));
  const shelfLifeOf = (p: Product) =>
    p.shelf_life_days ?? (p.shelf_life_preset_id ? (presetDays.get(p.shelf_life_preset_id) ?? null) : null);
  const visible = products.filter(
    (p) =>
      (showArchived || !p.archived) &&
      (business === "" || (business === NO_BUSINESS ? !p.business_id : p.business_id === business)) &&
      (!q || normalize(p.name).includes(q)),
  );
  const hasArchived = products.some((p) => p.archived);

  // One section per business, in the order of the business list; unclaimed last.
  const groups = [
    ...businesses.map((b) => ({ key: b.id, name: b.name, items: visible.filter((p) => p.business_id === b.id) })),
    {
      key: NO_BUSINESS,
      name: m.products.noBusiness,
      items: visible.filter((p) => !p.business_id || !businessName.has(p.business_id)),
    },
  ].filter((group) => group.items.length > 0);

  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <>
            {actions}
            <Button onClick={() => setEditing("new")}>
              <Plus />
              {m.products.add}
            </Button>
          </>
        }
      />

      {notice}

      <label className="mb-3 flex h-12 items-center gap-2.5 rounded-2xl border border-input bg-card px-4 transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/25">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={m.products.search}
          aria-label={m.products.search}
          className="min-w-0 flex-1 bg-transparent text-[16px] outline-none [&::-webkit-search-cancel-button]:hidden"
        />
      </label>

      <div className="mb-8 flex flex-wrap items-center gap-2">
        {hasBusinesses && (
          <div className="relative min-w-0 max-w-full">
            <select
              aria-label={m.products.business}
              value={business}
              onChange={(e) => setBusiness(e.target.value)}
              className={cn(
                pillClass,
                "max-w-full appearance-none truncate pl-4 pr-9 focus-visible:ring-3 focus-visible:ring-ring/40 [&>option]:bg-card [&>option]:text-foreground",
                business === "" ? pillIdle : pillActive,
              )}
            >
              <option value="">{m.stats.allBusinesses}</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
              <option value={NO_BUSINESS}>{m.products.noBusiness}</option>
            </select>
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2",
                business === "" ? "text-muted-foreground" : "text-background/70",
              )}
            />
          </div>
        )}
        {hasArchived && (
          <label
            className={cn(
              pillClass,
              "px-4 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/40",
              showArchived ? pillActive : cn(pillIdle, "text-muted-foreground hover:text-foreground"),
            )}
          >
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="sr-only"
            />
            <Archive className="size-4" aria-hidden="true" />
            {m.products.showArchived}
          </label>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="surface-card flex flex-col items-center gap-3 px-6 py-12 text-center">
          <div className="grid size-12 place-items-center rounded-full bg-surface text-muted-foreground">
            <Package className="size-5" aria-hidden="true" />
          </div>
          <p className="max-w-sm text-[15px] text-muted-foreground">{q ? m.products.noResults : m.products.empty}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          {groups.map((group) => (
            <Section
              key={group.key}
              title={
                hasBusinesses ? (
                  <span className="flex items-baseline gap-2">
                    <span className="min-w-0 truncate">{group.name}</span>
                    <span className="tabular text-[15px] font-medium text-muted-foreground">{group.items.length}</span>
                  </span>
                ) : undefined
              }
            >
              {/* Rows like a bank's payments; two columns once there is room for them. */}
              <RowList className="md:grid md:grid-cols-2 md:gap-x-1">
                {group.items.map((p) => (
                  <li key={p.id} className="min-w-0">
                    <button
                      type="button"
                      onClick={() => setEditing(p)}
                      className={cn(
                        "hover-surface flex min-h-16 w-full items-center gap-3.5 rounded-xl px-3 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
                        p.archived && "opacity-60",
                      )}
                    >
                      <ProductToken product={p} />
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-[-0.01em]">
                          {p.name}
                        </span>
                        {/* Name and price; only an archived product says more. */}
                        {p.archived && (
                          <span className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                            <span
                              className="size-1.5 shrink-0 rounded-full bg-muted-foreground/50"
                              aria-hidden="true"
                            />
                            {m.products.archived}
                          </span>
                        )}
                      </span>
                      <span
                        className={cn(
                          "tabular shrink-0 text-right text-[15px] font-semibold tracking-[-0.01em]",
                          p.price === null && "font-normal text-muted-foreground",
                        )}
                      >
                        {p.price !== null ? f.euro(p.price) : m.common.none}
                      </span>
                    </button>
                  </li>
                ))}
              </RowList>
            </Section>
          ))}
        </div>
      )}

      {editing && (
        <ProductDialog
          key={editing === "new" ? "new" : editing.id}
          product={editing === "new" ? null : editing}
          businesses={businesses}
          presets={presets}
          defaultBusiness={business === NO_BUSINESS ? "" : business}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

/** The product's photo in a round token, or the first letter of its name. */
function ProductToken({ product }: { product: Product }) {
  const src = mediaUrl(product.photo_path);
  if (!src) return <Avatar className="size-12 text-[16px]">{initial(product.name)}</Avatar>;
  return (
    <span
      aria-hidden="true"
      className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full bg-card shadow-[inset_0_0_0_1px_var(--border)]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="size-full object-contain p-1.5" />
    </span>
  );
}

/** A native select dressed like Input, with its own chevron. */
function FieldSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select {...props} className={cn(fieldSelectClass, className)} />
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

function ProductDialog({
  product,
  businesses,
  presets,
  defaultBusiness,
  onClose,
}: {
  product: Product | null;
  businesses: BusinessOption[];
  presets: ShelfLifePreset[];
  defaultBusiness: string;
  onClose: () => void;
}) {
  const { m, locale } = useI18n();
  const router = useRouter();
  const [image, setImage] = useState<{ file: File | null; removed: boolean }>({ file: null, removed: false });
  const [shelfLife, setShelfLife] = useState(
    product?.shelf_life_preset_id ?? (product?.shelf_life_days ? CUSTOM_SHELF_LIFE : ""),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(formData: FormData) {
    if (image.file) formData.set("photo", image.file);
    if (image.removed) formData.set("removePhoto", "1");
    setError(null);
    startTransition(async () => {
      try {
        await saveProduct(formData);
        router.refresh();
        onClose();
      } catch {
        setError(m.common.error);
      }
    });
  }

  function toggleArchived() {
    if (!product) return;
    startTransition(async () => {
      await setProductArchived(product.id, !product.archived);
      router.refresh();
      onClose();
    });
  }

  const priceText =
    product?.price !== null && product?.price !== undefined
      ? locale === "en"
        ? product.price.toFixed(2)
        : product.price.toFixed(2).replace(".", ",")
      : "";

  const optional = <span className="font-normal text-muted-foreground">({m.common.optional})</span>;
  const hint = "text-[13px] leading-snug text-muted-foreground";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{product ? m.products.edit : m.products.add}</DialogTitle>
        </DialogHeader>
        <form action={submit} className="grid gap-5">
          {product && <input type="hidden" name="id" value={product.id} />}
          <div className="grid gap-2">
            <Label htmlFor="name">{m.products.name}</Label>
            <Input id="name" name="name" defaultValue={product?.name ?? ""} required autoFocus={!product} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="price">
              {m.products.price} {optional}
            </Label>
            <Input id="price" name="price" inputMode="decimal" defaultValue={priceText} className="max-w-36" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="shelfLifePresetId">
              {m.products.shelfLife} {optional}
            </Label>
            <FieldSelect
              id="shelfLifePresetId"
              name="shelfLifePresetId"
              value={shelfLife}
              onChange={(e) => setShelfLife(e.target.value)}
            >
              <option value="">{m.products.shelfLifeNone}</option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name} · {fmt(m.products.shelfLifeDays, { days: preset.days })}
                </option>
              ))}
              <option value={CUSTOM_SHELF_LIFE}>{m.products.shelfLifeCustom}</option>
            </FieldSelect>
            {shelfLife === CUSTOM_SHELF_LIFE && (
              <Input
                name="shelfLifeDays"
                inputMode="numeric"
                defaultValue={product?.shelf_life_days ?? ""}
                aria-label={m.products.shelfLifeCustom}
                className="max-w-36"
                autoFocus
              />
            )}
            <p className={hint}>{m.products.shelfLifeHint}</p>
          </div>
          {businesses.length > 0 && (
            <div className="grid gap-2">
              <Label htmlFor="businessId">{m.products.business}</Label>
              <FieldSelect
                id="businessId"
                name="businessId"
                defaultValue={product ? (product.business_id ?? "") : defaultBusiness}
              >
                <option value="">{m.products.noBusiness}</option>
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </FieldSelect>
              <p className={hint}>{m.products.businessHint}</p>
            </div>
          )}
          <div className="grid gap-2.5">
            <Label>{m.products.photo}</Label>
            <ImagePicker
              initialUrl={mediaUrl(product?.photo_path)}
              onChange={setImage}
              chooseLabel={m.products.choosePhoto}
              changeLabel={m.products.changePhoto}
              removeLabel={m.products.removePhoto}
            />
          </div>
          {error && <p className="text-sm text-negative">{error}</p>}
          <DialogFooter>
            {product && (
              <Button
                type="button"
                variant="ghost"
                onClick={toggleArchived}
                disabled={isPending}
                className="h-11 sm:mr-auto sm:h-10"
              >
                {product.archived ? <ArchiveRestore /> : <Archive />}
                {product.archived ? m.products.restore : m.products.archive}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose} className="h-11 sm:h-10">
              {m.common.cancel}
            </Button>
            <Button type="submit" disabled={isPending} className="h-11 sm:h-10">
              {isPending ? m.common.saving : m.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
