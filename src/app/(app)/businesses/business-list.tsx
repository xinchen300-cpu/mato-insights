"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Store } from "lucide-react";
import { Avatar, ListRow, RowList, initial } from "@/components/list-row";
import { EmptyState } from "@/components/page-header";
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

/** The round token for a business: its own logo when it has one, else its first letter. */
function BusinessToken({ business }: { business: Business }) {
  if (!business.logo_path) return <Avatar>{initial(business.name)}</Avatar>;
  return (
    <Avatar className="bg-card ring-1 ring-border">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={mediaUrl(business.logo_path)!} alt="" className="size-7 object-contain" />
    </Avatar>
  );
}

export function BusinessList({ businesses }: { businesses: Row[] }) {
  const { m, f } = useI18n();

  if (businesses.length === 0) {
    return <EmptyState icon={<Store className="size-5" />} title={m.businesses.empty} />;
  }

  return (
    <RowList>
      {businesses.map((b) => {
        const since = b.started_on ? fmt(m.businesses.since, { date: f.date(b.started_on) }) : null;
        return (
          <li key={b.id}>
            <ListRow
              href={`/businesses/${b.id}`}
              leading={<BusinessToken business={b} />}
              title={b.name}
              subtitle={
                <>
                  <span className="block truncate">
                    {plural(b.machineNames.length, m.businesses.machinesOne, m.businesses.machinesOther)}
                    {b.machineNames.length > 0 && ` · ${b.machineNames.join(", ")}`}
                  </span>
                  {/* On a phone the date moves under the name, so the name keeps its room. */}
                  {since && <span className="block truncate sm:hidden">{since}</span>}
                </>
              }
              valueSub={since ? <span className="hidden text-muted-foreground sm:inline">{since}</span> : undefined}
              chevron
            />
          </li>
        );
      })}
    </RowList>
  );
}

/** The page's one action, with its dialog: only the essentials, the rest is set on the business' own page. */
export function AddBusiness() {
  const { m } = useI18n();
  const [adding, setAdding] = useState(false);

  return (
    <>
      <Button onClick={() => setAdding(true)}>
        <Plus />
        {m.businesses.add}
      </Button>
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
        <form action={submit} className="grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor="name">{m.businesses.name}</Label>
            <Input id="name" name="name" required autoFocus />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="startedOn">{m.businesses.startedOn}</Label>
            <Input id="startedOn" name="startedOn" type="date" className="w-fit" />
          </div>
          {error && <p className="text-[13.5px] font-medium text-negative">{error}</p>}
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
