"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmt } from "@/i18n/format";
import { useI18n } from "@/i18n/client";

/**
 * "Toon automaat nu" (Xin, 20-10-2026): a photo of this moment from the UniFi
 * camera aimed at the machine. Only on a tap, never by itself, so the camera
 * is asked only when someone looks; the photo lives in this page and is gone
 * when it closes.
 */
export function MachineCamera({ machineId, machineName }: { machineId: string; machineName: string }) {
  const { m, f } = useI18n();
  const [shot, setShot] = useState<{ url: string; at: Date } | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const url = useRef<string | null>(null);

  // The photo is a blob in this page: let it go when the page does.
  useEffect(() => () => void (url.current && URL.revokeObjectURL(url.current)), []);

  async function take() {
    setState("loading");
    try {
      const res = await fetch(`/api/camera/${machineId}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const next = URL.createObjectURL(await res.blob());
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = next;
      setShot({ url: next, at: new Date() });
      setState("idle");
    } catch {
      setState("error");
    }
  }

  const loading = state === "loading";
  return (
    <section className="surface-card px-5 py-5 sm:px-8 sm:py-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-semibold tracking-[-0.015em]">{m.machines.camera}</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {shot ? fmt(m.machines.cameraTakenAt, { time: f.time(shot.at) }) : m.machines.cameraHint}
          </p>
        </div>
        <Button variant={shot ? "secondary" : "default"} onClick={take} disabled={loading} className="w-full sm:w-auto">
          {shot ? <RefreshCw className={loading ? "animate-spin" : undefined} /> : <Camera />}
          {loading ? m.machines.cameraLoading : shot ? m.machines.cameraAgain : m.machines.cameraShow}
        </Button>
      </div>
      {state === "error" && (
        <p role="alert" className="mt-3 text-sm font-medium text-negative">
          {m.machines.cameraError}
        </p>
      )}
      {shot && (
        // A blob from this page, not a file Next could optimise.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={shot.url}
          alt={fmt(m.machines.cameraAlt, { name: machineName })}
          className={`mt-4 w-full rounded-xl bg-surface object-contain transition-opacity ${loading ? "opacity-60" : ""}`}
        />
      )}
    </section>
  );
}
