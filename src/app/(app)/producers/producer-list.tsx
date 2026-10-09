"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Avatar, RowList, initial } from "@/components/list-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { cn } from "@/lib/utils";
import type { Producer } from "@/lib/types";
import { deleteProducer, saveProducer } from "./actions";

type Row = Producer & { products: number; short: number };

/** Who makes the food, and how often they left the fridge short. */
export function ProducerList({ producers }: { producers: Row[] }) {
  const { m } = useI18n();
  const router = useRouter();
  const [adding, setAdding] = useState(producers.length === 0);
  const [editing, setEditing] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      await saveProducer(formData);
      setAdding(false);
      setEditing(null);
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await deleteProducer(id);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {producers.length > 0 && (
        <RowList>
          {producers.map((producer) =>
            editing === producer.id ? (
              <li key={producer.id} className="rounded-xl bg-surface p-4">
                <Fields producer={producer} onSubmit={submit} onCancel={() => setEditing(null)} pending={isPending} />
              </li>
            ) : (
              <li key={producer.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setEditing(producer.id)}
                  className="hover-surface flex min-h-16 min-w-0 flex-1 items-center gap-3.5 rounded-xl px-3 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
                >
                  <Avatar>{initial(producer.name)}</Avatar>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold tracking-[-0.01em]">{producer.name}</span>
                    <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                      {[producer.email, producer.phone].filter(Boolean).join(" · ")}
                    </span>
                    {/* On a phone the product count joins this line; wider, it stands on the right. */}
                    <span
                      className={cn(
                        "mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px]",
                        producer.short === 0 && "sm:hidden",
                      )}
                    >
                      <span className="tabular text-muted-foreground sm:hidden">
                        {fmt(m.producers.products, { count: producer.products })}
                      </span>
                      {producer.short > 0 && (
                        <span className="flex items-center gap-1.5 font-medium text-negative">
                          <span className="size-1.5 shrink-0 rounded-full bg-negative" aria-hidden="true" />
                          <span className="tabular">{fmt(m.producers.shortLast60, { count: producer.short })}</span>
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="tabular hidden shrink-0 text-right text-[13.5px] text-muted-foreground sm:block">
                    {fmt(m.producers.products, { count: producer.products })}
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(producer.id)}
                  disabled={isPending}
                  aria-label={m.common.delete}
                  className="mr-1 hover:text-negative"
                >
                  <Trash2 />
                </Button>
              </li>
            ),
          )}
        </RowList>
      )}

      {adding ? (
        <div className="surface-card p-4 sm:p-5">
          <Fields onSubmit={submit} onCancel={() => setAdding(false)} pending={isPending} />
        </div>
      ) : (
        <Button variant="outline" onClick={() => setAdding(true)} className="w-fit">
          <Plus />
          {m.producers.add}
        </Button>
      )}
    </div>
  );
}

function Fields({
  producer,
  onSubmit,
  onCancel,
  pending,
}: {
  producer?: Producer;
  onSubmit: (formData: FormData) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const { m } = useI18n();
  const id = producer?.id ?? "new";
  const label = "text-[13px] font-medium text-muted-foreground";

  return (
    <form action={onSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={producer?.id ?? ""} />
      <div className="grid gap-3 sm:grid-cols-[1fr_1.3fr_1fr]">
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor={`name-${id}`} className={label}>
            {m.producers.name}
          </Label>
          <Input id={`name-${id}`} name="name" defaultValue={producer?.name ?? ""} required />
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor={`email-${id}`} className={label}>
            {m.producers.email}
          </Label>
          <Input id={`email-${id}`} name="email" type="email" defaultValue={producer?.email ?? ""} />
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor={`phone-${id}`} className={label}>
            {m.producers.phone}
          </Label>
          <Input id={`phone-${id}`} name="phone" type="tel" defaultValue={producer?.phone ?? ""} />
        </div>
      </div>
      {/* Save first in the DOM (and on top on a phone); on wider screens it sits rightmost. */}
      <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
        <Button type="submit" disabled={pending} className="h-11 sm:h-10">
          {pending ? m.common.saving : m.common.save}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} className="h-11 sm:h-10">
          {m.common.cancel}
        </Button>
      </div>
    </form>
  );
}
