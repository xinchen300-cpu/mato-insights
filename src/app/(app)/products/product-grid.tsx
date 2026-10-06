"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ImageIcon, Plus } from "lucide-react";
import { ImagePicker } from "@/components/image-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { mediaUrl } from "@/lib/media";
import { CUSTOM_SHELF_LIFE } from "@/lib/expiry";
import type { Product, ShelfLifePreset } from "@/lib/types";
import { saveProduct, setProductArchived } from "./actions";

type BusinessOption = { id: string; name: string };

const NO_BUSINESS = "none";

const selectClass =
  "h-10 w-full border border-input bg-card px-3 text-base outline-none focus-visible:border-ring md:text-sm";

export function ProductGrid({
  products,
  slotCounts,
  businesses,
  initialBusiness = "",
  presets,
  producers,
}: {
  products: Product[];
  slotCounts: Record<string, number>;
  businesses: BusinessOption[];
  initialBusiness?: string;
  presets: ShelfLifePreset[];
  producers: BusinessOption[];
}) {
  const { m, f } = useI18n();
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  // "" is every business, NO_BUSINESS the products nobody claimed yet.
  const [business, setBusiness] = useState(initialBusiness);

  const businessName = new Map(businesses.map((b) => [b.id, b.name]));
  const presetDays = new Map(presets.map((p) => [p.id, p.days]));
  const shelfLifeOf = (p: Product) =>
    p.shelf_life_days ?? (p.shelf_life_preset_id ? (presetDays.get(p.shelf_life_preset_id) ?? null) : null);
  const visible = products.filter(
    (p) =>
      (showArchived || !p.archived) &&
      (business === "" || (business === NO_BUSINESS ? !p.business_id : p.business_id === business)),
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
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Button onClick={() => setEditing("new")}>
          <Plus />
          {m.products.add}
        </Button>
        <select
          aria-label={m.products.business}
          value={business}
          onChange={(e) => setBusiness(e.target.value)}
          className={`${selectClass} sm:ml-auto sm:w-56`}
        >
          <option value="">{m.stats.allBusinesses}</option>
          {businesses.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
          <option value={NO_BUSINESS}>{m.products.noBusiness}</option>
        </select>
        {hasArchived && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="size-4 accent-[var(--primary)]"
            />
            {m.products.showArchived}
          </label>
        )}
      </div>

      {groups.length === 0 ? (
        <p className="border border-dashed border-input bg-surface p-8 text-sm text-muted-foreground">
          {m.products.empty}
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map((group) => (
            <section key={group.key}>
              <h2 className="mb-3 flex items-baseline gap-2 text-lg">
                {group.name}
                <span className="tabular text-sm font-normal text-muted-foreground">{group.items.length}</span>
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {group.items.map((p) => {
                  const framed = group.items.some((item) => item.photo_path);
                  return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setEditing(p)}
                    className={`group flex flex-col border bg-card text-left transition-colors hover:border-primary/40 ${p.archived ? "opacity-60" : ""}`}
                  >
                    {framed && (
                      <div className="grid h-32 place-items-center bg-surface p-3">
                        {p.photo_path ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={mediaUrl(p.photo_path)!} alt="" className="max-h-full max-w-full object-contain" />
                        ) : (
                          <ImageIcon className="size-7 text-muted-foreground/60" />
                        )}
                      </div>
                    )}
                    <div className="flex flex-1 flex-col gap-1 p-3">
                      <span className="line-clamp-2 font-semibold leading-snug">{p.name}</span>
                      <span className="mt-auto flex items-center justify-between gap-2 text-sm text-muted-foreground">
                        <span className="tabular">{p.price !== null ? f.euro(p.price) : "—"}</span>
                        {p.archived ? (
                          <span>{m.products.archived}</span>
                        ) : slotCounts[p.id] ? (
                          <span>{fmt(m.products.inSlots, { count: slotCounts[p.id] })}</span>
                        ) : null}
                      </span>
                    </div>
                  </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {editing && (
        <ProductDialog
          key={editing === "new" ? "new" : editing.id}
          product={editing === "new" ? null : editing}
          businesses={businesses}
          presets={presets}
          producers={producers}
          defaultBusiness={business === NO_BUSINESS ? "" : business}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function ProductDialog({
  product,
  businesses,
  presets,
  producers,
  defaultBusiness,
  onClose,
}: {
  product: Product | null;
  businesses: BusinessOption[];
  presets: ShelfLifePreset[];
  producers: BusinessOption[];
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

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{product ? m.products.edit : m.products.add}</DialogTitle>
        </DialogHeader>
        <form action={submit} className="grid gap-4">
          {product && <input type="hidden" name="id" value={product.id} />}
          <div className="grid gap-2">
            <Label htmlFor="name">{m.products.name}</Label>
            <Input id="name" name="name" defaultValue={product?.name ?? ""} required autoFocus={!product} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="price">
              {m.products.price} <span className="font-normal text-muted-foreground">({m.common.optional})</span>
            </Label>
            <Input id="price" name="price" inputMode="decimal" defaultValue={priceText} className="max-w-32" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="shelfLifePresetId">
              {m.products.shelfLife}{" "}
              <span className="font-normal text-muted-foreground">({m.common.optional})</span>
            </Label>
            <select
              id="shelfLifePresetId"
              name="shelfLifePresetId"
              value={shelfLife}
              onChange={(e) => setShelfLife(e.target.value)}
              className={selectClass}
            >
              <option value="">{m.products.shelfLifeNone}</option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name} · {fmt(m.products.shelfLifeDays, { days: preset.days })}
                </option>
              ))}
              <option value={CUSTOM_SHELF_LIFE}>{m.products.shelfLifeCustom}</option>
            </select>
            {shelfLife === CUSTOM_SHELF_LIFE && (
              <Input
                name="shelfLifeDays"
                inputMode="numeric"
                defaultValue={product?.shelf_life_days ?? ""}
                aria-label={m.products.shelfLifeCustom}
                className="max-w-32"
                autoFocus
              />
            )}
            <p className="text-xs text-muted-foreground">{m.products.shelfLifeHint}</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="businessId">{m.products.business}</Label>
            <select
              id="businessId"
              name="businessId"
              defaultValue={product ? (product.business_id ?? "") : defaultBusiness}
              className={selectClass}
            >
              <option value="">{m.products.noBusiness}</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">{m.products.businessHint}</p>
          </div>
          {producers.length > 0 && (
            <div className="grid gap-2">
              <Label htmlFor="producerId">{m.producers.title}</Label>
              <select
                id="producerId"
                name="producerId"
                defaultValue={product?.producer_id ?? ""}
                className={selectClass}
              >
                <option value="">{m.producers.none}</option>
                {producers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid gap-2">
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
              <Button type="button" variant="ghost" onClick={toggleArchived} disabled={isPending} className="sm:mr-auto">
                {product.archived ? <ArchiveRestore /> : <Archive />}
                {product.archived ? m.products.restore : m.products.archive}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose}>
              {m.common.cancel}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? m.common.saving : m.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
