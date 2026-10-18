"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteOpenRounds } from "@/app/(app)/refill/actions";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { cn } from "@/lib/utils";

export type DeletableRound = { id: string; title: string; subtitle: string };

/**
 * "Rondes verwijderen" on Bijvullen, there whenever a round is open (Xin,
 * 19-10-2026): every open round in a list, each with its own Verwijderen, and
 * all of them at once. A delete asks "Zeker?" on the same button first.
 */
export function DeleteRounds({ rounds }: { rounds: DeletableRound[] }) {
  const { m } = useI18n();
  const t = m.refill;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  // "Zeker?" holds for a moment only; a stray tap later deletes nothing.
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(null), 4000);
    return () => clearTimeout(timer);
  }, [armed]);

  if (rounds.length === 0) return null;

  function remove(ids: string[]) {
    setFailed(false);
    startTransition(async () => {
      try {
        await deleteOpenRounds(ids);
        try {
          // What this phone kept of those rounds goes too.
          for (const id of ids) localStorage.removeItem(`vendly-round-${id}`);
        } catch {
          // Nothing kept then.
        }
        setArmed(null);
        if (ids.length >= rounds.length) setOpen(false);
        router.refresh();
      } catch {
        setFailed(true);
      }
    });
  }

  const tap = (key: string, ids: string[]) => (armed === key ? remove(ids) : setArmed(key));

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setArmed(null);
          setOpen(true);
        }}
        className="flex h-11 items-center justify-center gap-2 self-center rounded-full px-4 text-[15px] font-semibold text-negative active:scale-[0.98]"
      >
        <Trash2 className="size-4" aria-hidden="true" />
        {rounds.length === 1 ? t.deleteRoundOne : t.deleteRounds}
      </button>

      {open && (
        <Dialog open onOpenChange={(next) => !next && setOpen(false)}>
          <DialogContent className="grid-cols-1 gap-4">
            <DialogHeader>
              <DialogTitle>{t.deleteRoundsTitle}</DialogTitle>
              <DialogDescription>{t.deleteRoundsHint}</DialogDescription>
            </DialogHeader>
            <ul className="flex min-w-0 flex-col">
              {rounds.map((round) => (
                <li key={round.id} className="flex min-h-16 items-center gap-3 border-b border-border/60 py-2 last:border-0">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15.5px] font-semibold">{round.title}</span>
                    <span className="truncate text-[13px] text-muted-foreground">{round.subtitle}</span>
                  </span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => tap(round.id, [round.id])}
                    className={cn(
                      "h-11 shrink-0 rounded-full px-4 text-[14.5px] font-semibold transition-colors disabled:opacity-50",
                      armed === round.id ? "bg-negative text-white" : "bg-negative/10 text-negative",
                    )}
                  >
                    {armed === round.id ? t.deleteSure : t.deleteThis}
                  </button>
                </li>
              ))}
            </ul>
            {failed && <p className="text-[14px] font-medium text-negative">{m.common.error}</p>}
            {rounds.length > 1 && (
              <button
                type="button"
                disabled={pending}
                onClick={() => tap("all", rounds.map((round) => round.id))}
                className={cn(
                  "flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15.5px] font-semibold transition-colors disabled:opacity-50",
                  armed === "all" ? "bg-negative text-white" : "bg-negative/10 text-negative",
                )}
              >
                <Trash2 className="size-4" aria-hidden="true" />
                {armed === "all" ? fmt(t.deleteAllSure, { n: rounds.length }) : t.deleteAll}
              </button>
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
