/**
 * A selection still worth naming: it sold in the last 90 days. One rule for
 * every screen that counts them, so the overview and the products page never
 * give two numbers for the same thing; older ones are history, not a to-do.
 */
export const RECENT_DAYS = 90;

export function isRecent(group: { last_sale: string }, now: number = Date.now()): boolean {
  return now - Date.parse(group.last_sale) < RECENT_DAYS * 86_400_000;
}
