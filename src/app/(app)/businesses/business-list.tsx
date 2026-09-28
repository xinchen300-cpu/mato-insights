"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/client";
import { fmt, plural } from "@/i18n/format";
import { mediaUrl } from "@/lib/media";
import type { Business } from "@/lib/types";
import { saveBusiness } from "./actions";

type Row = Business & { machineNames: string[] };

export function BusinessList({ businesses }: { businesses: Row[] }) {
  const { m, f } = useI18n();
  const [adding, setAdding] = useState(false);

  return (
    <>
      <Button onClick={() => setAdding(true)} className="mb-5">
        <Plus />
        {m.businesses.add}
      </Button>

      {businesses.length === 0 ? (
        <p className="border border-dashed border-input bg-surface p-8 text-sm text-muted-foreground">
          {m.businesses.empty}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {businesses.map((b) => (
            <li key={b.id}>
              <Link
                href={`/businesses/${b.id}`}
                className="flex w-full items-center gap-4 border bg-card p-4 text-left shadow-[0_8px_22px_rgb(28_24_18/0.06)] transition-transform hover:-translate-y-0.5"
              >
                <span className="grid h-14 w-20 shrink-0 place-items-center bg-surface">
                  {b.logo_path ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mediaUrl(b.logo_path)!} alt="" className="max-h-12 max-w-16 object-contain" />
                  ) : (
                    <Store className="size-6 text-muted-foreground/60" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{b.name}</span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {plural(b.machineNames.length, m.businesses.machinesOne, m.businesses.machinesOther)}
                    {b.machineNames.length > 0 && ` · ${b.machineNames.join(", ")}`}
                  </span>
                  {b.started_on && (
                    <span className="block truncate text-sm text-muted-foreground">
                      {fmt(m.businesses.since, { date: f.date(b.started_on) })}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {adding && <AddBusinessDialog onClose={() => setAdding(false)} />}
    </>
  );
}

function AddBusinessDialog({ onClose }: { onClose: () => void }) {
  const { m } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Only the essentials here — the rest is set on the business' own page.
  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        const id = await saveBusiness(formData);
        router.push(`/businesses/${id}`);
      } catch {
        setError(m.common.error);
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{m.businesses.add}</DialogTitle>
        </DialogHeader>
        <form action={submit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="name">{m.businesses.name}</Label>
            <Input id="name" name="name" required autoFocus />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="startedOn">{m.businesses.startedOn}</Label>
            <Input id="startedOn" name="startedOn" type="date" className="w-fit" />
          </div>
          {error && <p className="text-sm text-negative">{error}</p>}
          <DialogFooter>
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
