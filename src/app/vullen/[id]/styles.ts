// The round's few controls, shared by its screens: one big black button for the
// next step, an outlined one for the other answer, a quiet one for "back".
// Everything is thumb-sized: the round is done standing, often with gloves.

export const primary =
  "flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-foreground text-[16px] font-semibold text-background transition-transform active:scale-[0.99] disabled:opacity-50";
export const outline =
  "flex h-14 w-full items-center justify-center rounded-2xl border border-input bg-card text-[16px] font-semibold active:scale-[0.99]";
export const ghost = "flex h-12 w-full items-center justify-center rounded-2xl text-[15px] font-semibold text-muted-foreground";
export const stepper =
  "grid size-12 shrink-0 place-items-center rounded-full bg-surface text-2xl font-medium text-foreground active:scale-95 disabled:opacity-40";
export const chip = "inline-flex h-10 items-center gap-1.5 rounded-full bg-card px-3.5 text-[14px] font-semibold ring-1 ring-border";
