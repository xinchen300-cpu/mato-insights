import { orderByRoute } from "@/lib/round-settings";
import { filledByVendly, slotsFilledByVendly } from "@/lib/stock";

type RoundMachines = { machines: { id: string; done: boolean; skipped: boolean }[] }[];

/**
 * The machines a round still open holds: the ones it will fill, and the ones it filled, which count as
 * filled only once that round is completed (Xin, 21-10-2026). Putting either on another round would fill
 * it twice. A machine the round skipped is free.
 */
export function heldByOpenRound(rounds: RoundMachines): Set<string> {
  return new Set(rounds.flatMap((round) => round.machines.filter((machine) => !machine.skipped).map((machine) => machine.id)));
}

/** Filled on a round still open: how full it is counts once that round is completed (Xin, 21-10-2026). */
export function filledOnOpenRound(rounds: RoundMachines): Set<string> {
  return new Set(rounds.flatMap((round) => round.machines.filter((machine) => machine.done && !machine.skipped).map((machine) => machine.id)));
}

/**
 * What one tap on "Vul route beginnen" puts on a round, as on the filler's
 * home: the machines Vendly fills that hold a product, minus those a round
 * still open holds (twice would fill them twice), in the route's order.
 * Machines with nothing missing are dropped when the round is made.
 */
export function startable<M extends { id: string; refill_manual: boolean }>(
  machines: M[],
  slots: { machine_id: string; product_id: string | null }[],
  openRounds: RoundMachines,
  route: string[],
): { ids: string[]; busy: Set<string>; stocked: M[] } {
  const fleet = filledByVendly(machines);
  const withProduct = new Set(slotsFilledByVendly(slots, machines).filter((slot) => slot.product_id).map((slot) => slot.machine_id));
  const busy = heldByOpenRound(openRounds);
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
