"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, LayoutTemplate, Plus, Square, Trash2 } from "lucide-react";
import { FrontView, OWNER_TONES, OwnerLegend, type FrontSlot } from "@/components/machine/front-view";
import { Panel, Section } from "@/components/page-header";
import { ProductPicker } from "@/components/product-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { defaultStep, expandTemplate, numberRow } from "@/lib/layout";
import { mediaUrl } from "@/lib/media";
import {
  SLOT_SIZES,
  type LayoutRowSpec,
  type LayoutTemplate as Template,
  type MachineType,
  type Product,
  type SlotSize,
} from "@/lib/types";
import { saveLayout, saveLayoutTemplate } from "../../actions";
import { createProduct } from "../../../products/actions";

type EditorRow = { key: string; size: SlotSize; depth: number; step: number; first: number; selections: string[] };
export type ExistingSlot = { row: number; selection: string; size: SlotSize; depth: number; owner?: string | null };
export type Owner = { id: string; name: string };
export type CopySource = { id: string; name: string; type: MachineType | null; slots: ExistingSlot[] };

const BUILDER_TYPES: MachineType[] = ["lift", "spiral", "locker"];
const MIXED = "__mixed__";
let keySeq = 0;
const newKey = () => `row-${++keySeq}`;

function rowsFromSlots(slots: ExistingSlot[]): EditorRow[] {
  const byRow = new Map<number, ExistingSlot[]>();
  for (const s of slots) byRow.set(s.row, [...(byRow.get(s.row) ?? []), s]);
  return [...byRow.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, row]) => {
      const first = Number(row[0].selection);
      const second = row[1] ? Number(row[1].selection) : NaN;
      return {
        key: newKey(),
        size: row[0].size,
        depth: row[0].depth,
        step: Number.isFinite(second) && second - first > 0 && second - first <= 2 ? second - first : defaultStep(row[0].size),
        first,
        selections: row.map((s) => s.selection),
      };
    });
}

function rowsFromTemplate(spec: LayoutRowSpec[]): EditorRow[] {
  return expandTemplate(spec).map((slots, i) => ({
    key: newKey(),
    size: spec[i].size,
    depth: spec[i].depth,
    step: spec[i].step || defaultStep(spec[i].size),
    first: Number(slots[0]?.selection_number ?? i * 10 + 1),
    selections: slots.map((s) => s.selection_number),
  }));
}

export function LayoutBuilder({
  machineId,
  machineName,
  initialType,
  existing,
  templates,
  copySources,
  products: initialProducts,
  initialAssignments,
  owners,
}: {
  machineId: string;
  machineName: string;
  initialType: MachineType | null;
  existing: ExistingSlot[];
  templates: Template[];
  copySources: CopySource[];
  products: Product[];
  initialAssignments: Record<string, string>;
  /** Both businesses of a shared machine, first one first; empty otherwise. */
  owners: Owner[];
}) {
  const { m } = useI18n();
  const router = useRouter();
  const [type, setType] = useState<MachineType>(
    initialType && initialType !== "other" ? initialType : "lift",
  );
  const [rows, setRows] = useState<EditorRow[]>(() => rowsFromSlots(existing));
  const [products, setProducts] = useState(initialProducts);
  const [assignments, setAssignments] = useState<Record<string, string | null>>(initialAssignments);
  // Like product links, a slot's owner is kept per selection number.
  const [slotOwners, setSlotOwners] = useState<Record<string, string>>(() =>
    Object.fromEntries(existing.filter((s) => s.owner).map((s) => [s.selection, s.owner as string])),
  );
  const shared = owners.length === 2;
  const ownerOf = (selection: string) =>
    owners.some((o) => o.id === slotOwners[selection]) ? slotOwners[selection] : owners[0]?.id;
  const toneOf = (ownerId: string | undefined) =>
    OWNER_TONES[Math.max(0, owners.findIndex((o) => o.id === ownerId)) % OWNER_TONES.length];
  const setOwner = (selections: string[], ownerId: string) =>
    setSlotOwners((current) => ({ ...current, ...Object.fromEntries(selections.map((sel) => [sel, ownerId])) }));
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const allSelections = rows.flatMap((r) => r.selections);
  const duplicate = allSelections.find((s, i) => s && allSelections.indexOf(s) !== i);
  const invalid = allSelections.some((s) => !/^[0-9]+$/.test(s));
  const totalCapacity = rows.reduce((sum, r) => sum + r.selections.length * r.depth, 0);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const frontRows: FrontSlot[][] = rows.map((row, r) =>
    row.selections.map((selection, i) => {
      const product = assignments[selection] ? productById.get(assignments[selection]!) : undefined;
      return {
        key: `${r}:${i}`,
        selection: selection || "?",
        size: row.size,
        capacity: row.depth,
        stock: null,
        productName: product?.name ?? null,
        photoUrl: mediaUrl(product?.photo_path),
        ownerTone: shared ? toneOf(ownerOf(selection)) : null,
      };
    }),
  );

  const [selRow, selIndex] = selectedKey ? selectedKey.split(":").map(Number) : [null, null];
  const selectedSelection = selRow !== null && selIndex !== null ? rows[selRow]?.selections[selIndex] : undefined;

  /**
   * A product link and a slot's owner hang on the selection number, so when a
   * number changes they have to travel with the slot. Otherwise renumbering a
   * row hands the neighbour's product — and on a shared fridge, the neighbour's
   * revenue — to whoever happens to land on that number.
   */
  function moveByPosition<T>(
    map: Record<string, T>,
    from: string[],
    to: string[],
    taken: Set<string>,
  ): Record<string, T> {
    if (from.join() === to.join()) return map;
    const next = { ...map };
    const parked: [string, T][] = [];
    from.forEach((was, i) => {
      const now = to[i];
      const value = map[was];
      if (value === undefined) return;
      // Nowhere safe to put it — the box is half typed, or that number already
      // belongs to another row — so leave it where it is rather than lose it.
      if (!now || taken.has(now) || taken.has(was)) return;
      delete next[was];
      parked.push([now, value]);
    });
    for (const [now, value] of parked) next[now] = value;
    return next;
  }

  /** Every number in use by the other rows: never overwritten, never emptied. */
  function othersThan(rowIndex: number) {
    return new Set(rows.flatMap((row, i) => (i === rowIndex ? [] : row.selections)));
  }

  function renumbered(rowIndex: number, from: string[], to: string[]) {
    const taken = othersThan(rowIndex);
    setAssignments((current) => moveByPosition(current, from, to, taken));
    setSlotOwners((current) => moveByPosition(current, from, to, taken));
  }

  function updateRow(index: number, patch: Partial<Pick<EditorRow, "size" | "depth" | "step" | "first">> & { count?: number }) {
    const row = rows[index];
    if (!row) return;
    const next = { ...row, ...patch };
    if (patch.size && patch.step === undefined) next.step = defaultStep(patch.size);
    // Changing the count keeps the numbers already typed and adds or drops
    // from the end; a new size renumbers the row, since the step changes.
    if (patch.count !== undefined) {
      const count = Math.max(1, Math.min(20, patch.count));
      const step = next.step || defaultStep(next.size);
      const last = Number(row.selections[row.selections.length - 1] ?? index * 10);
      next.selections =
        count <= row.selections.length
          ? row.selections.slice(0, count)
          : [
              ...row.selections,
              ...Array.from({ length: count - row.selections.length }, (_, k) => String(last + step * (k + 1))),
            ];
    } else if (patch.size) {
      next.selections = numberRow(index, row.selections.length, next.step, next.first);
    }

    setRows((current) => current.map((r, i) => (i === index ? next : r)));
    renumbered(index, row.selections, next.selections);
    setSelectedKey(null);
  }

  function setSelectionAt(rowIndex: number, slotIndex: number, value: string) {
    const clean = value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    const was = rows[rowIndex]?.selections[slotIndex];
    setRows((current) =>
      current.map((row, i) =>
        i === rowIndex ? { ...row, selections: row.selections.map((s, j) => (j === slotIndex ? clean : s)) } : row,
      ),
    );
    if (was && was !== clean) renumbered(rowIndex, [was], [clean]);
  }

  function setSelection(value: string) {
    if (selRow === null || selIndex === null) return;
    const clean = value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    const was = rows[selRow]?.selections[selIndex];
    setRows((current) =>
      current.map((row, i) =>
        i === selRow ? { ...row, selections: row.selections.map((s, j) => (j === selIndex ? clean : s)) } : row,
      ),
    );
    if (was && was !== clean) renumbered(selRow, [was], [clean]);
  }

  function addRow() {
    setRows((current) => {
      const index = current.length;
      const size: SlotSize = "small";
      return [
        ...current,
        { key: newKey(), size, depth: 5, step: 1, first: index * 10 + 1, selections: numberRow(index, 5, 1) },
      ];
    });
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, i) => i !== index));
    setSelectedKey(null);
  }

  function applyRows(next: EditorRow[], nextType?: MachineType | null) {
    setRows(next);
    if (nextType && nextType !== "other") setType(nextType);
    setSelectedKey(null);
    setMessage(null);
  }

  async function createAndAssign(name: string) {
    if (!selectedSelection) return;
    const product = await createProduct(name, null, machineId);
    setProducts((list) => [...list, product].sort((a, b) => a.name.localeCompare(b.name)));
    setAssignments((a) => ({ ...a, [selectedSelection]: product.id }));
  }

  function save() {
    if (duplicate) return setMessage({ tone: "error", text: fmt(m.layout.duplicateSelection, { number: duplicate }) });
    if (invalid) return setMessage({ tone: "error", text: m.layout.invalidSelection });

    const changed: Record<string, string | null> = {};
    for (const selection of allSelections) {
      const next = assignments[selection] ?? null;
      if (next !== (initialAssignments[selection] ?? null)) changed[selection] = next;
    }
    // A selection that was renumbered away still carries its old link in the
    // database; say so, or the product stays attached to a slot that is gone.
    for (const selection of Object.keys(initialAssignments)) {
      if (initialAssignments[selection] && !allSelections.includes(selection)) changed[selection] = null;
    }

    startTransition(async () => {
      try {
        await saveLayout(
          machineId,
          type,
          rows.map((row) =>
            row.selections.map((s) => ({
              selection_number: s,
              size: row.size,
              depth: row.depth,
              business_id: shared ? (ownerOf(s) ?? null) : null,
            })),
          ),
          changed,
        );
        router.push(`/machines/${machineId}`);
        router.refresh();
      } catch {
        setMessage({ tone: "error", text: m.common.error });
      }
    });
  }

  function saveTemplate() {
    if (!templateName.trim()) return;
    startTransition(async () => {
      try {
        await saveLayoutTemplate(
          templateName,
          type,
          rows.map((r) => ({ size: r.size, slots: r.selections.length, depth: r.depth, step: r.step })),
        );
        setTemplateName("");
        setMessage({ tone: "ok", text: m.layout.templateSaved });
      } catch {
        setMessage({ tone: "error", text: m.common.error });
      }
    });
  }

  // One field style for every box on this screen, at a size a thumb can hit.
  const numberInput =
    "h-11 w-full rounded-xl border border-input bg-card px-3 text-base tabular outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 md:text-sm";
  const fieldLabel = "text-[13px] font-medium text-muted-foreground";

  return (
    <div className="flex flex-col gap-10">
      <div className="grid gap-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-10">
        <section className="flex flex-col gap-2.5">
          <p className="eyebrow px-1">{m.layout.machineType}</p>
          <div className="flex w-full gap-1 rounded-full bg-surface p-1 sm:w-auto sm:self-start">
            {BUILDER_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                aria-pressed={type === t}
                className={cn(
                  "min-h-10 min-w-0 flex-auto rounded-full px-3 py-1.5 text-[14px] font-medium leading-tight transition-[background-color,color,box-shadow] duration-150 sm:flex-none sm:px-4",
                  type === t
                    ? "bg-card text-foreground shadow-[0_1px_3px_rgb(14_14_16/0.1)]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m.machines.types[t]}
              </button>
            ))}
          </div>
        </section>

        <section className="flex min-w-0 flex-col gap-2.5">
          <p className="eyebrow px-1">{m.layout.start}</p>
          {/* Choices wrap onto further lines, so every one stays in view on a phone too. */}
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <Button
                key={t.id}
                variant="outline"
                onClick={() => applyRows(rowsFromTemplate(t.layout), t.machine_type)}
              >
                <LayoutTemplate />
                {t.name}
              </Button>
            ))}
            {copySources.map((source) => (
              <Button
                key={source.id}
                variant="outline"
                onClick={() => applyRows(rowsFromSlots(source.slots), source.type)}
              >
                <Copy />
                {fmt(m.layout.copyFrom, { machine: source.name })}
              </Button>
            ))}
            <Button
              variant="ghost"
              onClick={() =>
                applyRows([{ key: newKey(), size: "small", depth: 5, step: 1, first: 1, selections: numberRow(0, 5, 1) }])
              }
            >
              <Square />
              {m.layout.startEmpty}
            </Button>
          </div>
        </section>
      </div>

      {rows.length > 0 && (
        <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-8">
          <section className="flex flex-col gap-4">
            {rows.map((row, index) => (
              <Panel
                key={row.key}
                title={fmt(m.layout.row, { number: index + 1 })}
                actions={
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeRow(index)}
                    aria-label={m.layout.removeRow}
                    className="-my-2 -mr-2"
                  >
                    <Trash2 />
                  </Button>
                }
              >
                <div className="grid grid-cols-3 gap-2.5">
                  <label className="grid min-w-0 gap-1.5">
                    <span className={cn(fieldLabel, "truncate")}>{m.layout.slots}</span>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={row.selections.length}
                      onChange={(e) => updateRow(index, { count: Number(e.target.value) || 1 })}
                      className={numberInput}
                    />
                  </label>
                  <label className="grid min-w-0 gap-1.5">
                    <span className={cn(fieldLabel, "truncate")}>{m.layout.slotSize}</span>
                    <select
                      value={row.size}
                      onChange={(e) => updateRow(index, { size: e.target.value as SlotSize })}
                      className={numberInput}
                    >
                      {SLOT_SIZES.map((s) => (
                        <option key={s} value={s}>
                          {m.layout.sizes[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid min-w-0 gap-1.5" title={m.layout.depthHint}>
                    <span className={cn(fieldLabel, "truncate")}>{m.layout.depth}</span>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={row.depth}
                      onChange={(e) => updateRow(index, { depth: Math.max(1, Math.min(99, Number(e.target.value) || 1)) })}
                      className={numberInput}
                    />
                  </label>
                </div>

                <div className="mt-5 grid gap-2">
                  <span className={fieldLabel}>{m.layout.numbers}</span>
                  <div className="flex flex-wrap gap-2">
                    {row.selections.map((selection, slotIndex) => (
                      <input
                        key={slotIndex}
                        inputMode="numeric"
                        value={selection}
                        aria-label={fmt(m.layout.editSlot, { number: selection || "?" })}
                        onChange={(e) => setSelectionAt(index, slotIndex, e.target.value)}
                        className={cn(numberInput, "w-12 px-1 text-center sm:w-14")}
                      />
                    ))}
                  </div>
                  <span className="text-[13px] text-muted-foreground">{m.layout.numbersHint}</span>
                </div>

                {shared && (
                  <label className="mt-5 grid gap-1.5">
                    <span className={cn(fieldLabel, "flex items-center gap-2")}>
                      {/* The owner's colour, the same one the preview and its legend use. */}
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: toneOf(ownerOf(row.selections[0])) }}
                        aria-hidden="true"
                      />
                      {m.layout.rowOwner}
                    </span>
                    <select
                      value={
                        new Set(row.selections.map(ownerOf)).size === 1 ? (ownerOf(row.selections[0]) ?? "") : MIXED
                      }
                      onChange={(e) => e.target.value !== MIXED && setOwner(row.selections, e.target.value)}
                      className={numberInput}
                    >
                      {owners.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                      <option value={MIXED} disabled>
                        {m.layout.mixedOwners}
                      </option>
                    </select>
                  </label>
                )}
              </Panel>
            ))}
            <Button variant="outline" size="lg" onClick={addRow} className="w-full sm:w-fit">
              <Plus />
              {m.layout.addRow}
            </Button>
          </section>

          <Section
            title={m.layout.preview}
            actions={
              <p className="tabular shrink-0 text-[14px] font-semibold">
                {fmt(m.layout.totalCapacity, { count: totalCapacity })}
              </p>
            }
            className="gap-4 lg:sticky lg:top-24 lg:self-start"
          >
            <div className="overflow-hidden rounded-2xl">
              <FrontView
                rows={frontRows}
                showStock={false}
                selectedKey={selectedKey}
                onSlotClick={(slot) => setSelectedKey(slot.key === selectedKey ? null : slot.key)}
              />
            </div>
            {shared && (
              <div className="px-1">
                <OwnerLegend owners={owners.map((o) => ({ name: o.name, tone: toneOf(o.id) }))} />
              </div>
            )}

            {selectedSelection !== undefined && (
              <div className="surface-card grid gap-5 p-5 ring-1 ring-primary/40 sm:p-6">
                <p className="font-heading text-[18px] font-semibold tracking-[-0.02em] text-heading">
                  {fmt(m.layout.editSlot, { number: selectedSelection || "?" })}
                </p>
                <div className="grid gap-4 sm:grid-cols-[7rem_minmax(0,1fr)]">
                  <div className="grid gap-2">
                    <Label htmlFor="slot-selection" className={fieldLabel}>
                      {m.layout.selection}
                    </Label>
                    <Input
                      id="slot-selection"
                      inputMode="numeric"
                      value={selectedSelection}
                      onChange={(e) => setSelection(e.target.value)}
                    />
                  </div>
                  <div className="grid min-w-0 gap-2">
                    <Label className={fieldLabel}>{m.layout.product}</Label>
                    <ProductPicker
                      products={products}
                      value={selectedSelection ? (assignments[selectedSelection] ?? null) : null}
                      onSelect={(id) =>
                        selectedSelection && setAssignments((a) => ({ ...a, [selectedSelection]: id }))
                      }
                      onCreate={createAndAssign}
                      allowNone
                      noneLabel={m.layout.noProduct}
                      disabled={!selectedSelection}
                    />
                  </div>
                  {shared && selectedSelection && (
                    <div className="grid gap-2 sm:col-span-2">
                      <Label htmlFor="slot-owner" className={fieldLabel}>
                        {m.layout.slotOwner}
                      </Label>
                      <select
                        id="slot-owner"
                        value={ownerOf(selectedSelection) ?? ""}
                        onChange={(e) => setOwner([selectedSelection], e.target.value)}
                        className={numberInput}
                      >
                        {owners.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            )}
          </Section>
        </div>
      )}

      <div className="flex flex-col gap-5 border-t pt-8">
        <p className="px-1 text-sm text-muted-foreground">{m.layout.historySafe}</p>
        {message && (
          <p
            className={cn(
              "px-1 text-sm font-semibold",
              message.tone === "error" ? "text-negative" : "text-positive",
            )}
          >
            {message.text}
          </p>
        )}
        <div className="flex flex-col gap-6 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <Button size="lg" onClick={save} disabled={isPending || rows.length === 0} className="w-full sm:w-auto">
            {isPending ? m.common.saving : m.layout.save}
          </Button>
          {rows.length > 0 && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="grid gap-2">
                <Label htmlFor="template-name" className={fieldLabel}>
                  {m.layout.templateName}
                </Label>
                <Input
                  id="template-name"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder={machineName}
                  className="w-full sm:w-56"
                />
              </div>
              <Button
                variant="outline"
                onClick={saveTemplate}
                disabled={isPending || !templateName.trim()}
                className="h-11 w-full sm:w-auto"
              >
                {m.layout.saveAsTemplate}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
