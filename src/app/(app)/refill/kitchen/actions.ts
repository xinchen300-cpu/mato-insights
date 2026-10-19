"use server";

import { revalidatePath } from "next/cache";
import { countProducerFridge, sendProductionOrder, type OrderLine } from "@/lib/data";
import { requireOperator, requireOrgId } from "@/lib/org";

/** Tonight's list passed on to the kitchen: written down as made, and returned for the message. */
export async function passOrder(producerId: string): Promise<OrderLine[]> {
  await requireOperator();
  const order = await sendProductionOrder(await requireOrgId(), producerId);
  revalidatePath("/refill/kitchen");
  return order;
}

/** What the operator counted in the kitchen's fridge for one dish. */
export async function countFridge(producerId: string, productId: string, qty: number): Promise<void> {
  await requireOperator();
  await countProducerFridge(await requireOrgId(), producerId, productId, qty);
  revalidatePath("/refill/kitchen");
}
