import { getI18n } from "@/i18n/server";
import { getMachines, getMachineStock, getOpenRounds, getRefillPlan, getRoundSettings } from "@/lib/data";
import { requireRefillAccess } from "@/lib/org";
import { lineTake } from "@/lib/refill-flow";
import { orderByRoute } from "@/lib/round-settings";
import { FillListView, type BoxItem } from "./view";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.fillList.title };
}

/**
 * The vullijst (Xin, 18-10-2026): what every machine needs now, one box per
 * machine in the order of the route, because each box is packed on its own.
 * It is the plan a round made now would carry, so the two never disagree.
 * Pieces only: no money on a filler's screen.
 */
export default async function FillListPage() {
  const orgId = await requireRefillAccess();
  const { m } = await getI18n();
  const [fleet, slots, settings, rounds] = await Promise.all([
    getMachines(orgId),
    getMachineStock(orgId),
    getRoundSettings(orgId),
    getOpenRounds(orgId),
  ]);
  // Only machines with dishes in them: one without a layout has nothing to fill yet.
  const stocked = new Set(slots.filter((slot) => slot.product_id).map((slot) => slot.machine_id));
  const order = orderByRoute(
    fleet.filter((machine) => stocked.has(machine.id)).map((machine) => machine.id),
    settings.route,
  );
  const plan = await getRefillPlan(orgId, order);

  const nameOf = new Map(fleet.map((machine) => [machine.id, machine.name]));
  const boxes = order.flatMap((machineId) => {
    const lines = plan
      .filter((line) => line.machine_id === machineId && lineTake(line) > 0)
      .sort((a, b) => a.row_position - b.row_position || a.slot_position - b.slot_position);
    if (lines.length === 0) return [];
    // One line per dish, in the order its first slot comes in the machine.
    const items = new Map<string, BoxItem>();
    for (const line of lines) {
      const item = items.get(line.product_id) ?? { productId: line.product_id, name: line.product_name, photoPath: line.photo_path, take: 0, slots: [] };
      item.take += lineTake(line);
      item.slots.push(line.selection_number);
      items.set(line.product_id, item);
    }
    const list = [...items.values()];
    return [{ machineId, name: nameOf.get(machineId) ?? "—", items: list, take: list.reduce((sum, item) => sum + item.take, 0) }];
  });
  const full = order.filter((id) => !boxes.some((box) => box.machineId === id)).map((id) => nameOf.get(id) ?? "—");
  // The round to go on with: one under way first, else the newest.
  const open = rounds.find((round) => round.readyAt) ?? rounds[0] ?? null;
  return <FillListView m={m} boxes={boxes} full={full} openId={open?.id ?? null} />;
}
