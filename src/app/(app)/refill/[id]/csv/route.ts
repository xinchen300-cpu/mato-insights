import { csvResponse } from "@/lib/csv";
import { getRefillSheet, getRunSummary } from "@/lib/data";
import { getI18n } from "@/i18n/server";
import { denyFiller, requireOrgId } from "@/lib/org";
import { combineByProduct, linesToFill } from "@/lib/refill";
import { roundActual, slotKey } from "@/lib/refill-flow";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await denyFiller();
  const { id } = await params;
  const { m } = await getI18n();
  const orgId = await requireOrgId();

  const sheet = await getRefillSheet(orgId, id);
  if (!sheet) return new Response("Not found", { status: 404 });

  const lines = linesToFill(sheet.lines);
  // A finished step-by-step round also says what really went in, next to the plan.
  const summary = sheet.flow_version === 2 && sheet.completed_at ? await getRunSummary(orgId, sheet.id) : [];
  const real = roundActual(
    sheet,
    summary.map((row) => ({ productId: row.product_id, qty: row.short })),
  )?.actual;
  const rows: (string | number)[][] = [
    [m.refill.combined],
    [m.refill.product, m.refill.toAdd, ...(real ? [m.refill.combinedDone] : [])],
    ...combineByProduct(lines).map((r) => [r.name, r.quantity, ...(real ? [real.taken[r.productId] ?? 0] : [])]),
    [],
    [m.refill.perMachine],
    [m.machines.name, m.refill.slot, m.refill.product, m.refill.inMachine, m.refill.fits, m.refill.toAdd, ...(real ? [m.refill.filledCol] : [])],
    ...lines.map((l) => [
      l.machine_name,
      l.selection_number,
      l.product_name,
      l.stock,
      l.capacity,
      l.to_add,
      ...(real ? [real.filled[slotKey(l.machine_id, l.selection_number)] ?? 0] : []),
    ]),
  ];

  return csvResponse(`mato-insights-refill-${sheet.created_at.slice(0, 10)}.csv`, rows);
}
