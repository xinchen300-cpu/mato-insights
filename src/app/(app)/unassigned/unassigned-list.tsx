"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { ProductPicker } from "@/components/product-picker";
import { useI18n } from "@/i18n/client";
import { fmt, plural } from "@/i18n/format";
import type { Product, UnassignedGroup } from "@/lib/types";
import { assignProduct } from "../machines/actions";
import { createProduct } from "../products/actions";

type Section = { machineId: string; machineName: string; groups: (UnassignedGroup & { lastSoldLabel: string })[] };

export function UnassignedList({ sections, products: initialProducts }: { sections: Section[]; products: Product[] }) {
  const { m } = useI18n();
  const [products, setProducts] = useState(initialProducts);
  const [linked, setLinked] = useState<Record<string, string>>({});

  return (
    <div className="flex flex-col gap-8">
      {sections.map((section) => (
        <section key={section.machineId}>
          <h2 className="mb-3 text-xl">{section.machineName}</h2>
          <ul className="flex flex-col divide-y border bg-card">
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
          </ul>
        </section>
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
        await assignProduct(group.machine_id, group.selection_number, productId);
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

  return (
    <li className="grid gap-3 p-4 sm:grid-cols-[1fr_18rem] sm:items-center">
      <div className="min-w-0">
        <p className="font-semibold">{fmt(labels.selection, { number: group.selection_number })}</p>
        <p className="text-sm text-muted-foreground">{details.join(" · ")}</p>
      </div>
      {linkedProductId ? (
        <p className="flex items-center gap-2 text-sm font-semibold text-positive">
          <Check className="size-4" />
          {m.unassigned.linked}: {products.find((p) => p.id === linkedProductId)?.name}
        </p>
      ) : (
        <div>
          <ProductPicker
            products={products}
            value={null}
            onSelect={(id) => id && link(id)}
            onCreate={createAndLink}
            placeholder={m.unassigned.link}
            disabled={isPending}
          />
          {error && <p className="mt-1 text-xs text-negative">{m.common.error}</p>}
        </div>
      )}
    </li>
  );
}
