"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { saveRunKm } from "../actions";

/**
 * The kilometres of a finished round, for the operator to write down or put
 * right: the drive in what the round cost.
 */
export function RunKm({
  sheetId,
  km,
  estimate = null,
}: {
  sheetId: string;
  km: number | null;
  /** What the cost counts while nothing is written: the one machine's distance there and back. */
  estimate?: number | null;
}) {
  const { m, f } = useI18n();
  const [editing, setEditing] = useState(km === null);
  // The number as typed, with the decimal mark of the language, never a thousands mark.
  const [value, setValue] = useState(
    km === null ? "" : String(km).replace(".", f.number(1.5).includes(",") ? "," : "."),
  );
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    const text = value.trim().replace(/\s/g, "").replace(",", ".");
    const next = text === "" ? null : Number(text);
    if (next !== null && !(Number.isFinite(next) && next > 0 && next <= 2000)) {
      setError(true);
      return;
    }
    startTransition(async () => {
      try {
        await saveRunKm(sheetId, next);
        setError(false);
        setEditing(next === null);
      } catch {
        setError(true);
      }
    });
  }

  if (!editing && km !== null) {
    return (
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        <span className="tabular text-[15px] font-semibold">{fmt(m.refill.runKm, { km: f.number(km) })}</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={m.common.edit}
          title={m.common.edit}
          className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
        >
          <Pencil className="size-3.5" />
        </button>
      </span>
    );
  }
  return (
    <form
      className="flex flex-col items-end gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <span className="flex items-center gap-2">
        <Input
          aria-label={m.refill.kmLabel}
          inputMode="decimal"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={estimate === null ? "km" : f.number(estimate)}
          className="h-9 w-16 text-right"
        />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? m.common.saving : m.common.save}
        </Button>
      </span>
      {error && <span className="text-[13px] font-medium text-negative">{m.common.error}</span>}
    </form>
  );
}
