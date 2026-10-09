"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { saveSheetNotes } from "../actions";

export function NotesForm({ sheetId, initialNotes }: { sheetId: string; initialNotes: string }) {
  const { m } = useI18n();
  const [notes, setNotes] = useState(initialNotes);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value);
          setSaved(false);
        }}
        placeholder={m.refill.notesPlaceholder}
        aria-label={m.refill.notes}
        rows={3}
        className="w-full resize-y rounded-2xl border border-input bg-card px-4 py-3 text-base transition-[border-color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 md:text-sm"
      />
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          disabled={isPending || notes === initialNotes}
          onClick={() =>
            startTransition(async () => {
              await saveSheetNotes(sheetId, notes);
              setSaved(true);
            })
          }
        >
          {isPending ? m.common.saving : m.refill.saveNotes}
        </Button>
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-positive">
            <span className="size-1.5 rounded-full bg-positive" aria-hidden="true" />
            {m.common.saved}
          </span>
        )}
      </div>
    </div>
  );
}
