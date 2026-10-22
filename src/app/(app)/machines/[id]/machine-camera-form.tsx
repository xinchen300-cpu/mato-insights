"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { fmt } from "@/i18n/format";
import { useI18n } from "@/i18n/client";
import type { LinkedCamera } from "@/lib/camera-link";
import type { UnifiCamera } from "@/lib/unifi";
import { listMachineCameras, setMachineCameras } from "../actions";

type Option = { consoleId: string; cameraId: string; label: string };

/**
 * Which UniFi cameras look at this machine: one or more (21-10-2026, Sferio's
 * machine has two). The list is only fetched when asked, since every look at
 * UniFi counts against its limit per console. Each tick is saved at once, like
 * the photo above it.
 */
export function MachineCameraForm({ machineId, linked }: { machineId: string; linked: LinkedCamera[] }) {
  const { m } = useI18n();
  const router = useRouter();
  const [options, setOptions] = useState<Option[] | null>(null);
  const [picked, setPicked] = useState<string[]>(() => linked.map((camera) => camera.cameraId));
  const [status, setStatus] = useState<"idle" | "saved" | "error" | "listError">("idle");
  const [loading, startLoading] = useTransition();
  const [saving, startSaving] = useTransition();

  const nameOf = (camera: LinkedCamera, i: number) => camera.name ?? `${m.machines.cameraUnnamed} ${i + 1}`;

  function load() {
    setStatus("idle");
    startLoading(async () => {
      try {
        const cameras: UnifiCamera[] = await listMachineCameras();
        // Several consoles: say which one each camera hangs on. The model (22-10-2026) tells which camera does what.
        const consoles = new Set(cameras.map((c) => c.consoleId));
        const listed: Option[] = cameras.map((c) => ({
          consoleId: c.consoleId,
          cameraId: c.id,
          label: [c.name, c.model, consoles.size > 1 ? c.consoleName : null, c.online ? null : m.machines.cameraOffline]
            .filter(Boolean)
            .join(" · "),
        }));
        // A linked camera UniFi no longer lists stays visible, so it is not lost without a word.
        const missing: Option[] = linked
          .filter((camera) => !cameras.some((c) => c.id === camera.cameraId))
          .map((camera, i) => ({ consoleId: camera.consoleId, cameraId: camera.cameraId, label: `${nameOf(camera, i)} · ${m.machines.cameraMissing}` }));
        setOptions([...missing, ...listed]);
      } catch {
        setStatus("listError");
      }
    });
  }

  function toggle(cameraId: string) {
    if (!options) return;
    const next = picked.includes(cameraId) ? picked.filter((id) => id !== cameraId) : [...picked, cameraId];
    setPicked(next);
    setStatus("idle");
    startSaving(async () => {
      try {
        await setMachineCameras(
          machineId,
          next.flatMap((id) => {
            const option = options.find((o) => o.cameraId === id);
            return option ? [{ consoleId: option.consoleId, cameraId: option.cameraId }] : [];
          }),
        );
        setStatus("saved");
        router.refresh();
      } catch {
        setStatus("error");
      }
    });
  }

  return (
    <div className="grid gap-3">
      <div>
        <p className="text-[15px] font-semibold tracking-[-0.01em]">{m.machines.cameraSetting}</p>
        <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{m.machines.cameraSettingHint}</p>
      </div>
      {options === null ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm">
            {linked.length ? fmt(m.machines.cameraLinkedList, { names: linked.map(nameOf).join(", ") }) : m.machines.cameraNone}
          </span>
          <Button variant="secondary" onClick={load} disabled={loading}>
            {loading ? m.machines.cameraLoading : m.machines.cameraChoose}
          </Button>
        </div>
      ) : options.length === 0 ? (
        <p className="text-sm text-muted-foreground">{m.machines.cameraNoneFound}</p>
      ) : (
        <ul className="grid gap-1" aria-label={m.machines.cameraSetting}>
          {options.map((option) => (
            <li key={option.cameraId}>
              <label className="hover-surface flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3">
                <input
                  type="checkbox"
                  className="size-5 accent-foreground"
                  checked={picked.includes(option.cameraId)}
                  onChange={() => toggle(option.cameraId)}
                  disabled={saving}
                />
                <span className="text-[14.5px]">{option.label}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {saving && <span className="text-sm text-muted-foreground">{m.common.saving}</span>}
      {!saving && status === "saved" && <span className="text-sm font-medium text-positive">{m.common.saved}</span>}
      {status === "error" && <span className="text-sm font-medium text-negative">{m.common.error}</span>}
      {status === "listError" && <span className="text-sm font-medium text-negative">{m.machines.cameraListError}</span>}
    </div>
  );
}
