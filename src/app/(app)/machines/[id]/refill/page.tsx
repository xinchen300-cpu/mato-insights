import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { fmt } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { getMachine, getMachineStock, getProducts, getShelfLifePresets } from "@/lib/data";
import { denyFiller, requireOrgId } from "@/lib/org";
import { StockForm } from "./stock-form";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.machines.refill };
}

export default async function RefillMachinePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  await denyFiller();
  const [{ id }, { mode: rawMode }] = await Promise.all([params, searchParams]);
  const mode = rawMode === "correction" ? "correction" : "refill";
  const { m } = await getI18n();
  const orgId = await requireOrgId();

  const machine = await getMachine(orgId, id);
  if (!machine) notFound();

  const slots = await getMachineStock(orgId, [id]);
  if (slots.length === 0) redirect(`/machines/${id}/layout`);

  // How long each product keeps, so the date picker can suggest one — the same
  // number the share-link sheet uses.
  const [products, presets] = await Promise.all([getProducts(orgId), getShelfLifePresets(orgId)]);
  const presetDays = new Map(presets.map((p) => [p.id, p.days]));
  const shelfLife = Object.fromEntries(
    products.map((p) => [
      p.id,
      p.shelf_life_preset_id ? (presetDays.get(p.shelf_life_preset_id) ?? null) : p.shelf_life_days,
    ]),
  ) as Record<string, number | null>;

  return (
    <>
      <PageHeader
        backHref={`/machines/${id}`}
        backLabel={machine.name}
        title={fmt(mode === "refill" ? m.stock.refillTitle : m.stock.correctTitle, { machine: machine.name })}
        subtitle={mode === "refill" ? m.stock.refillHint : m.stock.correctHint}
      />
      <StockForm key={mode} machineId={id} slots={slots} mode={mode} shelfLife={shelfLife} />
    </>
  );
}
