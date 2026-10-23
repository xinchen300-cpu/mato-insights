import { SegmentedLinks } from "@/components/segmented";
import type { Messages } from "@/i18n/messages/en";

/** The operator's views of refilling: the rounds, the people who do them, the route, how a round goes, and what the kitchen makes. */
export function RefillTabs({ active, m }: { active: "rounds" | "fillers" | "route" | "workflow" | "kitchen"; m: Messages }) {
  return (
    <SegmentedLinks
      items={[
        { href: "/refill", label: m.fillers.tabRounds, active: active === "rounds" },
        { href: "/refill/fillers", label: m.fillers.title, active: active === "fillers" },
        { href: "/refill/route", label: m.route.tab, active: active === "route" },
        { href: "/refill/workflow", label: m.workflow.tab, active: active === "workflow" },
        { href: "/refill/kitchen", label: m.kitchen.tab, active: active === "kitchen" },
      ]}
    />
  );
}
