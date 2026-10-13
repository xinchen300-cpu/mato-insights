"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Avatar, RowList } from "@/components/list-row";
import { Section } from "@/components/page-header";
import { ProductPicker } from "@/components/product-picker";
import { useI18n } from "@/i18n/client";
import { fmt, plural } from "@/i18n/format";
import type { Product, UnassignedGroup } from "@/lib/types";
import { linkUnassigned } from "./actions";
import { createProduct } from "../products/actions";

type MachineSection = { machineId: string; machineName: string; groups: (UnassignedGroup & { lastSoldLabel: string })[] };

export function UnassignedList({ sections, products: initialProducts }: { sections: MachineSection[]; products: Product[] }) {
  const { m } = useI18n();
  const [products, setProducts] = useState(initialProducts);
  const [linked, setLinked] = useState<Record<string, string>>({});

  return (
    <div className="flex flex-col gap-10">
      {sections.map((section) => (
        <Section key={section.machineId} title={section.machineName}>
          <RowList>
            {section.groups.map((group) => (
              <UnassignedRow
                key={group.selection_number}
                group={group}
                products={products}
                linkedProductId={linked[`${group.machine_id}:${group.selection_number}`] ?? null}
                onLinked={(productId) =>
                  setLinked((l) => ({ ...l, [`${group.machine_id}:${group.selection_number}`]: productId }))
                }
                onCreated={(p) => setProducts((list) => [...list, p].sort((a, b) => a.name.localeCompare(b.name)))}
                labels={{ selection: m.unassigned.selection }}
              />
            ))}
          </RowList>
        </Section>
      ))}
    </div>
  );
}

function UnassignedRow({
  group,
  products,
  linkedProductId,
  onLinked,
  onCreated,
  labels,
}: {
  group: UnassignedGroup & { lastSoldLabel: string };
  products: Product[];
  linkedProductId: string | null;
  onLinked: (productId: string) => void;
  onCreated: (product: Product) => void;
  labels: { selection: string };
}) {
  const { m, f } = useI18n();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  function link(productId: string) {
    setError(false);
    startTransition(async () => {
      try {
        await linkUnassigned(group.machine_id, group.selection_number, productId);
        onLinked(productId);
      } catch {
        setError(true);
      }
    });
  }

  async function createAndLink(name: string) {
    const product = await createProduct(name, group.typical_price, group.machine_id);
    onCreated(product);
    link(product.id);
  }

  const details = [
    plural(group.sales, m.common.salesOne, m.common.salesOther),
    group.typical_price !== null ? fmt(m.unassigned.usually, { price: f.euro(group.typical_price) }) : null,
    fmt(m.unassigned.lastSold, { when: group.lastSoldLabel }),
  ].filter(Boolean);

  // Side by side on a wide screen; on a phone the picker drops under the name,
  // lined up with the text, with room for a thumb.
  return (
    <li className="flex flex-col gap-3 rounded-xl px-3 py-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 items-center gap-3.5">
        <Avatar tone={linkedProductId ? "positive" : "neutral"} className="text-[13px] tabular-nums">
          {linkedProductId ? <Check /> : group.selection_number}
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold tracking-[-0.01em]">
            {fmt(labels.selection, { number: group.selection_number })}
          </p>
          <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{details.join(" · ")}</p>
        </div>
      </div>
      {linkedProductId ? (
        <p className="flex items-start gap-1.5 pl-[54px] text-[13.5px] font-medium text-positive sm:w-72 sm:shrink-0 sm:pl-0">
          <Check className="mt-0.5 size-4 shrink-0" />
          <span>
            {m.unassigned.linked}: {products.find((p) => p.id === linkedProductId)?.name}
          </span>
        </p>
      ) : (
        <div className="pl-[54px] sm:w-72 sm:shrink-0 sm:pl-0">
          <ProductPicker
            products={products}
            value={null}
            onSelect={(id) => id && link(id)}
            onCreate={createAndLink}
            placeholder={m.unassigned.link}
            disabled={isPending}
          />
          {error && <p className="mt-1.5 text-[13px] font-medium text-negative">{m.common.error}</p>}
        </div>
      )}
    </li>
  );
}
