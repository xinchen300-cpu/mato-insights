"use client";

import { useState } from "react";
import { MachineCamera } from "@/app/(app)/machines/[id]/machine-camera";
import { useI18n } from "@/i18n/client";

export type CameraMachine = { id: string; name: string; cameras: { id: string; name: string }[] };

/**
 * The camera under Net verkocht (Xin, 21-10-2026: "add the camera feature to net verkocht, but only with
 * Diksmuide", the one machine of Chens Garden with a camera): the same photo, Live and full screen as on the
 * machine's own page, without going there. Every machine with a camera linked is offered; with more than one,
 * a choice of machine sits above the buttons and switching closes what was open.
 */
export function OverviewCamera({ machines }: { machines: CameraMachine[] }) {
  const { m } = useI18n();
  const [current, setCurrent] = useState(machines[0]?.id ?? "");
  const machine = machines.find((candidate) => candidate.id === current) ?? machines[0];
  if (!machine) return null;

  const picker =
    machines.length > 1 ? (
      <div className="flex w-full flex-wrap gap-1.5" role="group" aria-label={m.machines.cameraWhichMachine}>
        {machines.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            aria-pressed={candidate.id === machine.id}
            onClick={() => setCurrent(candidate.id)}
            className="h-9 rounded-full border border-border px-3.5 text-[13.5px] font-semibold text-muted-foreground transition-colors aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background"
          >
            {candidate.name}
          </button>
        ))}
      </div>
    ) : undefined;

  return (
    <MachineCamera
      key={machine.id}
      machineId={machine.id}
      machineName={machine.name}
      cameras={machine.cameras}
      title={machines.length > 1 ? m.machines.camera : `${m.machines.camera} · ${machine.name}`}
      picker={picker}
    />
  );
}
