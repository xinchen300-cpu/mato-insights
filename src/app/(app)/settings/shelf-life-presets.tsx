"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Avatar, initial } from "@/components/list-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import type { ShelfLifePreset } from "@/lib/types";
import { cn } from "@/lib/utils";
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

  // One card: a row per kind of food, then either the way to add one or the form for it.
  return (
    <div className="surface-card flex flex-col p-2">
      {presets.length > 0 && (
        <ul className="flex flex-col">
          {presets.map((preset) => (
            <li key={preset.id} className="flex min-h-16 items-center gap-3.5 rounded-xl px-3 py-3">
              <Avatar>{initial(preset.name)}</Avatar>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold tracking-[-0.01em]">{preset.name}</span>
                <span className="mt-0.5 block text-[13px] text-muted-foreground">
                  {fmt(m.products.shelfLifeDays, { days: preset.days })}
                </span>
              </span>
              <Button
                variant="ghost"
                size="icon"
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
        <form
          action={saveShelfLifePreset}
          className={cn("flex flex-wrap items-end gap-3 px-3 pb-3 pt-3", presets.length > 0 && "mt-1 border-t pt-4")}
        >
          <div className="grid min-w-0 flex-1 basis-44 gap-1.5">
            <Label htmlFor="preset-name" className="text-[13px] text-muted-foreground">
              {m.settings.presetName}
            </Label>
            <Input id="preset-name" name="name" placeholder={m.settings.presetPlaceholder} required />
          </div>
          <div className="grid w-24 gap-1.5">
            <Label htmlFor="preset-days" className="text-[13px] text-muted-foreground">
              {m.settings.presetDays}
            </Label>
            <Input id="preset-days" name="days" inputMode="numeric" required />
          </div>
          <div className="flex gap-2">
            <Button type="submit" className="h-11">
              {m.common.save}
            </Button>
            {presets.length > 0 && (
              <Button type="button" variant="ghost" className="h-11" onClick={() => setAdding(false)}>
                {m.common.cancel}
              </Button>
            )}
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="hover-surface flex min-h-16 w-full items-center gap-3.5 rounded-xl px-3 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
        >
          <Avatar tone="gold">
            <Plus />
          </Avatar>
          <span className="text-[15px] font-semibold tracking-[-0.01em]">{m.settings.addPreset}</span>
        </button>
      )}
    </div>
  );
}
