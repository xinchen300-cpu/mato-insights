"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
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
        <ul className="flex flex-col divide-y border bg-card">
          {producers.map((producer) =>
            editing === producer.id ? (
              <li key={producer.id} className="p-4">
                <Fields producer={producer} onSubmit={submit} onCancel={() => setEditing(null)} pending={isPending} />
              </li>
            ) : (
              <li key={producer.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <button type="button" onClick={() => setEditing(producer.id)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate font-semibold">{producer.name}</span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {[producer.email, producer.phone].filter(Boolean).join(" · ")}
                  </span>
                </button>
                <span className="tabular shrink-0 text-sm text-muted-foreground">
                  {fmt(m.producers.products, { count: producer.products })}
                </span>
                {producer.short > 0 && (
                  <span className="tabular shrink-0 text-sm font-semibold text-negative">
                    {fmt(m.producers.shortLast60, { count: producer.short })}
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => remove(producer.id)}
                  disabled={isPending}
                  aria-label={m.common.delete}
                >
                  <Trash2 />
                </Button>
              </li>
            ),
          )}
        </ul>
      )}

      {adding ? (
        <div className="border bg-card p-4">
          <Fields onSubmit={submit} onCancel={() => setAdding(false)} pending={isPending} />
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setAdding(true)} className="w-fit">
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

  return (
    <form action={onSubmit} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="id" value={producer?.id ?? ""} />
      <div className="grid gap-1.5">
        <Label htmlFor={`name-${id}`} className="text-xs text-muted-foreground">
          {m.producers.name}
        </Label>
        <Input id={`name-${id}`} name="name" defaultValue={producer?.name ?? ""} className="w-44" required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`email-${id}`} className="text-xs text-muted-foreground">
          {m.producers.email}
        </Label>
        <Input id={`email-${id}`} name="email" type="email" defaultValue={producer?.email ?? ""} className="w-56" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`phone-${id}`} className="text-xs text-muted-foreground">
          {m.producers.phone}
        </Label>
        <Input id={`phone-${id}`} name="phone" type="tel" defaultValue={producer?.phone ?? ""} className="w-40" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? m.common.saving : m.common.save}
      </Button>
      <Button type="button" variant="ghost" onClick={onCancel}>
        {m.common.cancel}
      </Button>
    </form>
  );
}
