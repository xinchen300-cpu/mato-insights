import { SegmentedLinks } from "@/components/segmented";
import type { Messages } from "@/i18n/messages/en";

/** The operator's two views of refilling: the rounds, and the people who do them. */
export function RefillTabs({ active, m }: { active: "rounds" | "fillers"; m: Messages }) {
  return (
    <SegmentedLinks
      items={[
        { href: "/refill", label: m.fillers.tabRounds, active: active === "rounds" },
        { href: "/refill/fillers", label: m.fillers.title, active: active === "fillers" },
      ]}
    />
  );
}
