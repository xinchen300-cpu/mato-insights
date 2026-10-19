"use server";

import { revalidatePath } from "next/cache";
import { ensureProducerLink, producerStockAsOperator, type ProducerStockKind } from "@/lib/data";
import { requireOperator, requireOrgId } from "@/lib/org";

/** The producer's link for the kitchen: made once, the same every day after. */
export async function producerLink(producerId: string): Promise<string> {
  await requireOperator();
  return ensureProducerLink(await requireOrgId(), producerId);
}

/** What the kitchen made, or what is in the fridge, written by the operator in the app. */
export async function writeProducerStock(producerId: string, productId: string, kind: ProducerStockKind, qty: number): Promise<void> {
  await requireOperator();
  await producerStockAsOperator(await requireOrgId(), producerId, productId, kind, qty);
  revalidatePath("/refill/kitchen");
}
