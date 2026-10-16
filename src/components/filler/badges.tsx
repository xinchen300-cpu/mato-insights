import { Award, Boxes, Flag, Medal, Package, Repeat, Trophy } from "lucide-react";
import { MachineIcon } from "@/components/machine/machine-icon";
import type { Messages } from "@/i18n/messages";
import type { BadgeId } from "@/lib/filler-stats";
import { cn } from "@/lib/utils";

const ICONS = {
  first: Flag,
  record: Medal,
  rounds10: Repeat,
  records3: Trophy,
  machines100: MachineIcon,
  items1000: Package,
  rounds50: Award,
  items5000: Boxes,
} as const;

/** What a badge is called and what it asks, in the reader's language. */
export function badgeText(m: Messages, id: BadgeId): { name: string; hint: string } {
  const t = m.me;
  const all: Record<BadgeId, { name: string; hint: string }> = {
    first: { name: t.badgeFirst, hint: t.badgeFirstHint },
    record: { name: t.badgeRecord, hint: t.badgeRecordHint },
    rounds10: { name: t.badgeRounds10, hint: t.badgeRounds10Hint },
    records3: { name: t.badgeRecords3, hint: t.badgeRecords3Hint },
    machines100: { name: t.badgeMachines100, hint: t.badgeMachines100Hint },
    items1000: { name: t.badgeItems1000, hint: t.badgeItems1000Hint },
    rounds50: { name: t.badgeRounds50, hint: t.badgeRounds50Hint },
    items5000: { name: t.badgeItems5000, hint: t.badgeItems5000Hint },
  };
  return all[id];
}

/**
 * A badge as a round medal: warm gold once earned, a quiet grey before.
 * Gold is the app's accent, so it stays rare on the screen and means something.
 */
export function BadgeMedal({
  id,
  earned,
  size = "md",
  className,
}: {
  id: BadgeId;
  earned: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const Icon = ICONS[id];
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full",
        size === "md" ? "size-14" : "size-10",
        earned
          ? "bg-gradient-to-b from-[#f6e8c8] to-[#e6cd94] text-[#76500f] shadow-[inset_0_0_0_1.5px_rgb(166_117_44/0.32),0_1px_2px_rgb(118_80_15/0.18)]"
          : "bg-surface text-muted-foreground/60",
        className,
      )}
      aria-hidden="true"
    >
      <Icon className={size === "md" ? "size-6" : "size-[18px]"} strokeWidth={2} />
    </span>
  );
}
