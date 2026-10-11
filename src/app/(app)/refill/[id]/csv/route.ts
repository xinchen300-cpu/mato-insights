import { csvResponse } from "@/lib/csv";
import { getRefillSheet } from "@/lib/data";
import { getI18n } from "@/i18n/server";
import { denyFiller, requireOrgId } from "@/lib/org";
import { combineByProduct, linesToFill } from "@/lib/refill";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await denyFiller();
  const { id } = await params;
  const { m } = await getI18n();
  const orgId = await requireOrgId();

  const sheet = await getRefillSheet(orgId, id);
  if (!sheet) return new Response("Not found", { status: 404 });

  const lines = linesToFill(sheet.lines);
  const rows: (string | number)[][] = [
    [m.refill.combined],
    [m.refill.product, m.refill.toAdd],
    ...combineByProduct(lines).map((r) => [r.name, r.quantity]),
    [],
    [m.refill.perMachine],
    [m.machines.name, m.refill.slot, m.refill.product, m.refill.inMachine, m.refill.fits, m.refill.toAdd],
    ...lines.map((l) => [l.machine_name, l.selection_number, l.product_name, l.stock, l.capacity, l.to_add]),
  ];

  return csvResponse(`vendly-refill-${sheet.created_at.slice(0, 10)}.csv`, rows);
}
