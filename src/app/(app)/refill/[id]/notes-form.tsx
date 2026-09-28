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
        rows={3}
        className="w-full resize-y border border-input bg-card p-3 text-base outline-none focus-visible:border-ring md:text-sm"
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
        {saved && <span className="text-sm text-positive">{m.common.saved}</span>}
      </div>
    </div>
  );
}
