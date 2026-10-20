"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import type { UnifiCamera } from "@/lib/unifi";
import { listMachineCameras, setMachineCamera } from "../actions";

const NONE = "";
const selectClass =
  "h-11 w-full rounded-xl border border-input bg-card px-3.5 text-base outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 md:text-sm";
const keyOf = (consoleId: string, cameraId: string) => `${consoleId}|${cameraId}`;

/**
 * Which UniFi camera looks at this machine. The list is only fetched when
 * asked: every look at UniFi counts against its limit per console. A choice
 * is saved as soon as it is made, like the photo above it.
 */
export function MachineCameraForm({ machineId, linked }: { machineId: string; linked: { consoleId: string; cameraId: string } | null }) {
  const { m } = useI18n();
  const router = useRouter();
  const [cameras, setCameras] = useState<UnifiCamera[] | null>(null);
  const [current, setCurrent] = useState(linked ? keyOf(linked.consoleId, linked.cameraId) : NONE);
  const [status, setStatus] = useState<"idle" | "saved" | "error" | "listError">("idle");
  const [loading, startLoading] = useTransition();
  const [saving, startSaving] = useTransition();

  function load() {
    setStatus("idle");
    startLoading(async () => {
      try {
        setCameras(await listMachineCameras());
      } catch {
        setStatus("listError");
      }
    });
  }

  function choose(value: string) {
    const camera = cameras?.find((c) => keyOf(c.consoleId, c.id) === value) ?? null;
    setCurrent(value);
    setStatus("idle");
    startSaving(async () => {
      try {
        await setMachineCamera(machineId, camera ? { consoleId: camera.consoleId, cameraId: camera.id } : null);
        setStatus("saved");
        router.refresh();
      } catch {
        setStatus("error");
      }
    });
  }

  // Several consoles: say which one each camera hangs on.
  const consoles = new Set(cameras?.map((c) => c.consoleId));
  const label = (c: UnifiCamera) =>
    [c.name, consoles.size > 1 ? c.consoleName : null, c.online ? null : m.machines.cameraOffline].filter(Boolean).join(" · ");

  return (
    <div className="grid gap-3">
      <div>
        <p className="text-[15px] font-semibold tracking-[-0.01em]">{m.machines.cameraSetting}</p>
        <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{m.machines.cameraSettingHint}</p>
      </div>
      {cameras === null ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm">{current ? m.machines.cameraLinked : m.machines.cameraNone}</span>
          <Button variant="secondary" onClick={load} disabled={loading}>
            {loading ? m.machines.cameraLoading : m.machines.cameraChoose}
          </Button>
        </div>
      ) : cameras.length === 0 ? (
        <p className="text-sm text-muted-foreground">{m.machines.cameraNoneFound}</p>
      ) : (
        <select
          aria-label={m.machines.cameraSetting}
          value={current}
          onChange={(e) => choose(e.target.value)}
          disabled={saving}
          className={selectClass}
        >
          <option value={NONE}>{m.machines.cameraNoCamera}</option>
          {/* A linked camera UniFi no longer lists stays visible, so the choice is not silently lost. */}
          {current && !cameras.some((c) => keyOf(c.consoleId, c.id) === current) && <option value={current}>{m.machines.cameraLinked}</option>}
          {cameras.map((c) => (
            <option key={keyOf(c.consoleId, c.id)} value={keyOf(c.consoleId, c.id)}>
              {label(c)}
            </option>
          ))}
        </select>
      )}
      {saving && <span className="text-sm text-muted-foreground">{m.common.saving}</span>}
      {!saving && status === "saved" && <span className="text-sm font-medium text-positive">{m.common.saved}</span>}
      {status === "error" && <span className="text-sm font-medium text-negative">{m.common.error}</span>}
      {status === "listError" && <span className="text-sm font-medium text-negative">{m.machines.cameraListError}</span>}
    </div>
  );
}
