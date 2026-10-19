import { orderByRoute } from "@/lib/round-settings";
import { filledByVendly, slotsFilledByVendly } from "@/lib/stock";

/**
 * What one tap on "Vul route beginnen" puts on a round, as on the filler's
 * home: the machines Vendly fills that hold a product, minus those a round
 * still open will fill (twice would fill them twice), in the route's order.
 * Machines with nothing missing are dropped when the round is made.
 */
export function startable<M extends { id: string; refill_manual: boolean }>(
  machines: M[],
  slots: { machine_id: string; product_id: string | null }[],
  openRounds: { machines: { id: string; done: boolean }[] }[],
  route: string[],
): { ids: string[]; busy: Set<string>; stocked: M[] } {
  const fleet = filledByVendly(machines);
  const withProduct = new Set(slotsFilledByVendly(slots, machines).filter((slot) => slot.product_id).map((slot) => slot.machine_id));
  const busy = new Set(openRounds.flatMap((round) => round.machines.filter((machine) => !machine.done).map((machine) => machine.id)));
  const stocked = fleet.filter((machine) => withProduct.has(machine.id));
  return { ids: orderByRoute(stocked.filter((machine) => !busy.has(machine.id)).map((machine) => machine.id), route), busy, stocked };
}

/**
 * The owner's own open round, to carry on with instead of starting another
 * one beside it: one already under way first, else the newest (the list comes
 * newest first). Someone else's round is never theirs to go on with.
 */
export function ownRound<R extends { mine: boolean; readyAt: string | null }>(rounds: R[]): R | null {
  const mine = rounds.filter((round) => round.mine);
  return mine.find((round) => round.readyAt) ?? mine[0] ?? null;
}
