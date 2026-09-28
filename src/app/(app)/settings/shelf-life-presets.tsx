"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import type { ShelfLifePreset } from "@/lib/types";
import { deleteShelfLifePreset, saveShelfLifePreset } from "./actions";

// Set a shelf life once per kind of food, instead of on every product.
export function ShelfLifePresets({ presets }: { presets: ShelfLifePreset[] }) {
  const { m } = useI18n();
  const [adding, setAdding] = useState(presets.length === 0);
  const [isPending, startTransition] = useTransition();

  // The server action revalidates, so a new list arriving means it saved.
  useEffect(() => setAdding(presets.length === 0), [presets.length]);

  function remove(id: string) {
    startTransition(() => deleteShelfLifePreset(id));
  }

  return (
    <div className="flex flex-col gap-3">
      {presets.length > 0 && (
        <ul className="flex flex-col divide-y">
          {presets.map((preset) => (
            <li key={preset.id} className="flex items-center justify-between gap-3 py-2.5">
              <span>
                <span className="block font-semibold">{preset.name}</span>
                <span className="text-sm text-muted-foreground">
                  {fmt(m.products.shelfLifeDays, { days: preset.days })}
                </span>
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => remove(preset.id)}
                disabled={isPending}
                aria-label={m.common.delete}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <form action={saveShelfLifePreset} className="flex flex-wrap items-end gap-3 border-t pt-3">
          <div className="grid gap-1.5">
            <Label htmlFor="preset-name" className="text-xs text-muted-foreground">
              {m.settings.presetName}
            </Label>
            <Input id="preset-name" name="name" placeholder={m.settings.presetPlaceholder} className="w-44" required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="preset-days" className="text-xs text-muted-foreground">
              {m.settings.presetDays}
            </Label>
            <Input id="preset-days" name="days" inputMode="numeric" className="w-24" required />
          </div>
          <Button type="submit">{m.common.save}</Button>
          {presets.length > 0 && (
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
              {m.common.cancel}
            </Button>
          )}
        </form>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setAdding(true)} className="w-fit">
          <Plus />
          {m.settings.addPreset}
        </Button>
      )}
    </div>
  );
}
