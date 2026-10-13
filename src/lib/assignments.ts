/** One product's time in a slot, as stored: Postgres timestamps, "-infinity" for "always". */
export type AssignmentSpan = { valid_from: string; valid_to: string | null };

/** A stretch of time no product covers. `to` is null when it runs on to now and beyond. */
export type Uncovered = { from: string; to: string | null };

const moment = (value: string) =>
  value === "-infinity" ? -Infinity : value === "infinity" ? Infinity : Date.parse(value);

/**
 * The stretches of time in which a slot had no product, given its history.
 * A slot that got its product at a rearrangement has one before it; a slot
 * that was cleared and never filled again has an open one at the end. The
 * bounds are the stored timestamps themselves, so filling a gap meets its
 * neighbours exactly.
 */
export function uncovered(spans: AssignmentSpan[]): Uncovered[] {
  const sorted = [...spans].sort((a, b) => moment(a.valid_from) - moment(b.valid_from));
  const gaps: Uncovered[] = [];
  let cursor = "-infinity";
  let cursorAt = -Infinity;
  for (const span of sorted) {
    if (moment(span.valid_from) > cursorAt) gaps.push({ from: cursor, to: span.valid_from });
    const end = span.valid_to === null ? Infinity : moment(span.valid_to);
    if (end > cursorAt) {
      cursor = span.valid_to ?? "infinity";
      cursorAt = end;
    }
  }
  if (cursorAt < Infinity) gaps.push({ from: cursor, to: null });
  return gaps;
}
