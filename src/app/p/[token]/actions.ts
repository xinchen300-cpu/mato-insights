"use server";

import { revalidatePath } from "next/cache";
import { producerStockByToken, type ProducerStockKind } from "@/lib/data";

/**
 * The kitchen's own writes, through its link and without an account: what it
 * made tonight and what it counted in the fridge. The link is the access:
 * data.ts refuses a wrong or revoked one, and only the producer's own dishes.
 */
export async function writeByLink(token: string, productId: string, kind: ProducerStockKind, qty: number): Promise<void> {
  await producerStockByToken(token, productId, kind, qty);
  revalidatePath(`/p/${token}`);
}
