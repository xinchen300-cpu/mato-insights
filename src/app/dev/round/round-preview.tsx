"use client";

import { useEffect, useState } from "react";
import { RoundFlow, type RoundApi } from "@/app/vullen/[id]/round-flow";
import { previewHistory, previewRound, previewTimes, type Scenario } from "../preview-data";

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Stand-ins for the server: they answer after a moment, like the real ones on a phone.
const api: RoundApi = {
  savePicked: async () => {},
  startRound: () => wait(350),
  completeStop: () => wait(250),
  skipStop: () => wait(250),
  completeRound: () => wait(400),
  reopenStop: () => wait(300),
};

export function RoundPreview({ scenario }: { scenario: Scenario }) {
  // Built after mounting, from this moment: the server's clock would not match the browser's.
  const [data, setData] = useState<{ round: ReturnType<typeof previewRound>; history: ReturnType<typeof previewHistory> } | null>(null);
  useEffect(() => {
    const now = Date.now();
    const round = previewRound(scenario, now);
    try {
      localStorage.removeItem(`vendly-round-${round.id}`);
    } catch {
      // A preview without storage still works.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- made once, after mounting
    setData({ round, history: previewHistory(scenario, now) });
  }, [scenario]);
  if (!data) return null;
  return <RoundFlow round={data.round} who="Jonas" times={previewTimes} history={data.history} api={api} />;
}
