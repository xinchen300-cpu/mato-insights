import { SegmentedLinks } from "@/components/segmented";
import type { Messages } from "@/i18n/messages/en";

/** The operator's views of refilling: the rounds, the people who do them, and how a round goes. */
export function RefillTabs({ active, m }: { active: "rounds" | "fillers" | "workflow"; m: Messages }) {
  return (
    <SegmentedLinks
      items={[
        { href: "/refill", label: m.fillers.tabRounds, active: active === "rounds" },
        { href: "/refill/fillers", label: m.fillers.title, active: active === "fillers" },
        { href: "/refill/workflow", label: m.workflow.tab, active: active === "workflow" },
      ]}
    />
  );
}
