"use client";

import { useEffect, useState } from "react";
import { FiguresCard, FillerFigures } from "@/components/filler/figures";
import { PageHeader } from "@/components/page-header";
import { DISPLAY_TIME_ZONE } from "@/i18n/format";
import { fillerStats, type FillerStats } from "@/lib/filler-stats";
import { previewFigures, previewMachineNames } from "../preview-data";

export function FiguresPreview({ fresh }: { fresh: boolean }) {
  // Built after mounting, from this moment: the server's clock would not match the browser's.
  const [stats, setStats] = useState<FillerStats | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- made once, after mounting
    setStats(fillerStats(fresh ? [] : previewFigures(Date.now()), DISPLAY_TIME_ZONE));
  }, [fresh]);
  if (!stats) return null;
  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 sm:px-6">
      {stats.rounds > 0 && (
        <div className="mb-10">
          <FiguresCard stats={stats} />
        </div>
      )}
      <PageHeader title="Jouw cijfers" subtitle="Je rondes, je niveau en je beste tijden." backHref="/dev/figures" backLabel="Bijvullen" />
      <FillerFigures stats={stats} names={previewMachineNames} />
    </main>
  );
}
