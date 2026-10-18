"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, Minus, Plus } from "lucide-react";
import { Section } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import type { Dish } from "@/lib/data";
import { numberRow } from "@/lib/layout";
import type { SlotStock } from "@/lib/types";
import { cn } from "@/lib/utils";
import { createDish, saveSlots } from "../../actions";

type EditSlot = { key: string; number: string; product: string | null };
type EditRow = { key: string; slots: EditSlot[] };

const NEW = "__new__";
let keySeq = 0;
const newKey = () => `k${++keySeq}`;

function rowsOf(slots: SlotStock[]): EditRow[] {
  const byRow = new Map<number, SlotStock[]>();
  for (const slot of slots) byRow.set(slot.row_position, [...(byRow.get(slot.row_position) ?? []), slot]);
  return [...byRow.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, row]) => ({
      key: newKey(),
      slots: row
        .sort((a, b) => a.slot_position - b.slot_position)
        .map((slot) => ({ key: newKey(), number: slot.selection_number, product: slot.product_id })),
    }));
}

/** The step a row counts in: the gap between its last two numbers, else one. */
function stepOf(slots: EditSlot[]) {
  const numbers = slots.map((slot) => Number(slot.number)).filter((n) => Number.isFinite(n));
  const gap = numbers.length > 1 ? numbers.at(-1)! - numbers.at(-2)! : 1;
  return gap > 0 && gap <= 2 ? gap : 1;
}

/**
 * The layout of a machine for whoever fills it (Xin, 17-10-2026), kept simple:
 * one button opens it, then each row gets a minus and plus for how many slots
 * it has, and each slot its number and a product to pick, or a new one to type.
 * Nothing is sent before "save".
 */
export function LayoutEditor({ machineId, slots, dishes: initialDishes }: { machineId: string; slots: SlotStock[]; dishes: Dish[] }) {
  const { m } = useI18n();
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<EditRow[]>(() => rowsOf(slots));
  const [dishes, setDishes] = useState(initialDishes);
  const [typing, setTyping] = useState<{ slot: string; name: string } | null>(null);
  const [result, setResult] = useState<"saved" | "error" | null>(null);

  // A product a slot already has stays pickable, even one this machine would no longer be offered.
  const named = new Map(slots.flatMap((slot) => (slot.product_id ? [[slot.product_id, slot.product_name ?? "?"] as const] : [])));
  for (const dish of dishes) named.set(dish.id, dish.name);
  const options = [...named.entries()].sort(([, a], [, b]) => a.localeCompare(b));

  const numbers = rows.flatMap((row) => row.slots.map((slot) => slot.number.trim()));
  const missing = numbers.some((number) => !number);
  const twice = numbers.find((number, i) => number && numbers.indexOf(number) !== i);
  const problem = missing ? m.layout.invalidSelection : twice ? fmt(m.layout.duplicateSelection, { number: twice }) : null;

  function open() {
    setRows(rowsOf(slots));
    setDishes(initialDishes);
    setTyping(null);
    setResult(null);
    setEditing(true);
  }

  function changeSlot(rowKey: string, slotKey: string, patch: Partial<EditSlot>) {
    setRows((current) =>
      current.map((row) =>
        row.key === rowKey ? { ...row, slots: row.slots.map((slot) => (slot.key === slotKey ? { ...slot, ...patch } : slot)) } : row,
      ),
    );
  }

  function resize(rowIndex: number, by: 1 | -1) {
    setRows((current) =>
      current.map((row, i) => {
        if (i !== rowIndex) return row;
        if (by < 0) return { ...row, slots: row.slots.slice(0, -1) };
        const last = Number(row.slots.at(-1)?.number);
        const number = Number.isFinite(last) && row.slots.length ? String(last + stepOf(row.slots)) : String(rowIndex * 10 + 1);
        return { ...row, slots: [...row.slots, { key: newKey(), number, product: null }] };
      }),
    );
  }

  function addRow() {
    setRows((current) => {
      const last = current.at(-1)?.slots ?? [];
      const count = Math.max(1, last.length);
      return [
        ...current,
        { key: newKey(), slots: numberRow(current.length, count, stepOf(last)).map((number) => ({ key: newKey(), number, product: null })) },
      ];
    });
  }

  function addDish(rowKey: string, slotKey: string, name: string) {
    if (!name.trim()) return;
    startTransition(async () => {
      try {
        const dish = await createDish(machineId, name);
        setDishes((current) => (current.some((d) => d.id === dish.id) ? current : [...current, dish]));
        changeSlot(rowKey, slotKey, { product: dish.id });
        setTyping(null);
      } catch {
        setResult("error");
      }
    });
  }

  function save() {
    setResult(null);
    startTransition(async () => {
      try {
        await saveSlots(
          machineId,
          rows.map((row) => row.slots.map((slot) => slot.number.trim())),
          Object.fromEntries(rows.flatMap((row) => row.slots.map((slot) => [slot.number.trim(), slot.product]))),
        );
        setEditing(false);
        setResult("saved");
        router.refresh();
      } catch {
        setResult("error");
      }
    });
  }

  if (!editing) {
    return (
      <Section title={m.machines.layout} hint={m.refill.layoutHint}>
        <Button size="lg" variant="outline" onClick={open} className="w-full sm:w-auto sm:self-start">
          <LayoutGrid />
          {m.machines.editLayout}
        </Button>
        {result === "saved" && <p className="px-1 text-sm font-semibold text-positive">{m.layout.saved}</p>}
      </Section>
    );
  }

  return (
    <Section title={m.machines.layout} hint={m.layout.historySafe}>
      <div className="flex flex-col gap-5">
        {rows.map((row, rowIndex) => (
          <section key={row.key} className="surface-card flex flex-col gap-2 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[15px] font-semibold">{fmt(m.layout.row, { number: rowIndex + 1 })}</span>
              {/* How many slots this row has. */}
              <span className="flex items-center gap-1 rounded-full bg-surface p-1">
                <button
                  type="button"
                  onClick={() => resize(rowIndex, -1)}
                  disabled={busy || row.slots.length === 0}
                  aria-label={`− ${fmt(m.layout.row, { number: rowIndex + 1 })}`}
                  className="grid size-10 place-items-center rounded-full bg-card text-foreground active:scale-95 disabled:opacity-30"
                >
                  <Minus className="size-5" strokeWidth={2.5} />
                </button>
                <span className="tabular min-w-12 text-center text-[13px] text-muted-foreground">
                  <span className="text-[17px] font-bold text-foreground">{row.slots.length}</span> {m.layout.slots.toLowerCase()}
                </span>
                <button
                  type="button"
                  onClick={() => resize(rowIndex, 1)}
                  disabled={busy || row.slots.length >= 16}
                  aria-label={`+ ${fmt(m.layout.row, { number: rowIndex + 1 })}`}
                  className="grid size-10 place-items-center rounded-full bg-foreground text-background active:scale-95 disabled:opacity-30"
                >
                  <Plus className="size-5" strokeWidth={2.5} />
                </button>
              </span>
            </div>

            {row.slots.map((slot) => (
              <div key={slot.key} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <input
                    value={slot.number}
                    onChange={(event) => changeSlot(row.key, slot.key, { number: event.target.value.replace(/\D/g, "").slice(0, 4) })}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    aria-label={fmt(m.layout.slotTitle, { number: slot.number })}
                    className={cn(
                      "h-11 w-16 shrink-0 rounded-lg border bg-card text-center font-mono text-[17px] font-bold outline-none focus:ring-3 focus:ring-ring/25",
                      (!slot.number.trim() || slot.number.trim() === twice) && "border-negative",
                    )}
                  />
                  <select
                    value={typing?.slot === slot.key ? NEW : (slot.product ?? "")}
                    onChange={(event) => {
                      if (event.target.value === NEW) return setTyping({ slot: slot.key, name: "" });
                      setTyping(null);
                      changeSlot(row.key, slot.key, { product: event.target.value || null });
                    }}
                    aria-label={m.layout.product}
                    className="h-11 min-w-0 flex-1 rounded-lg border bg-card px-2 text-base outline-none md:text-[15px] focus:ring-3 focus:ring-ring/25"
                  >
                    <option value="">{m.layout.noProduct}</option>
                    {options.map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                    <option value={NEW}>{m.layout.newProductOption}</option>
                  </select>
                </div>
                {typing?.slot === slot.key && (
                  <div className="flex items-center gap-2 pl-[4.5rem]">
                    <input
                      autoFocus
                      value={typing.name}
                      onChange={(event) => setTyping({ slot: slot.key, name: event.target.value })}
                      onKeyDown={(event) => event.key === "Enter" && addDish(row.key, slot.key, typing.name)}
                      placeholder={m.products.name}
                      className="h-11 min-w-0 flex-1 rounded-lg border bg-card px-3 text-base outline-none md:text-[15px] focus:ring-3 focus:ring-ring/25"
                    />
                    <Button onClick={() => addDish(row.key, slot.key, typing.name)} disabled={busy || !typing.name.trim()}>
                      {m.common.add}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </section>
        ))}

        <Button variant="outline" size="lg" onClick={addRow} disabled={busy || rows.length >= 20} className="w-full sm:w-auto sm:self-start">
          <Plus />
          {m.layout.addRow}
        </Button>
      </div>

      {/* Clears the tab bar on phones, the iPhone's home bar included. */}
      <div className="surface-card sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 mt-2 flex flex-col gap-2 bg-card/95 p-3 backdrop-blur-xl lg:bottom-4">
        {problem && <span className="px-1 text-sm font-medium text-negative">{problem}</span>}
        {result === "error" && <span className="px-1 text-sm text-negative">{m.common.error}</span>}
        <div className="flex gap-2">
          <Button size="lg" onClick={save} disabled={busy || Boolean(problem) || numbers.length === 0} className="flex-1 sm:flex-none">
            {busy ? m.common.saving : m.layout.save}
          </Button>
          <Button size="lg" variant="outline" onClick={() => setEditing(false)} disabled={busy}>
            {m.common.cancel}
          </Button>
        </div>
      </div>
    </Section>
  );
}
