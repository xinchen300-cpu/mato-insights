"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Maximize2, Minimize2, Radio, RefreshCw, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmt } from "@/i18n/format";
import { useI18n } from "@/i18n/client";

/** "Live" (Xin, 21-10-2026; first called "Bijna live"): a new photo every few seconds, never longer than a minute. */
const LIVE_EVERY_MS = 3_000;
const LIVE_FOR_MS = 60_000;

/**
 * "Toon automaat nu" (Xin, 20-10-2026): a photo of this moment from the UniFi
 * camera aimed at the machine. Only on a tap, never by itself, so the camera
 * is asked only when someone looks; the photo lives in this page and is gone
 * when it closes. "Live" repeats it every few seconds for a minute, and
 * stops sooner when the page is left or a photo fails. A machine with several
 * cameras (21-10-2026) shows one at a time, picked above the buttons.
 */
export function MachineCamera({
  machineId,
  machineName,
  cameras,
}: {
  machineId: string;
  machineName: string;
  cameras: { id: string; name: string }[];
}) {
  const { m, f } = useI18n();
  const [selected, setSelected] = useState(cameras[0]?.id ?? "");
  // The live loop reads the camera from here, so switching never mixes two cameras.
  const chosen = useRef(selected);
  const [shot, setShot] = useState<{ url: string; at: Date } | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [live, setLive] = useState(false);
  // Full screen (Xin, 21-10-2026): the photo as big as the screen, Live going on in it.
  const [full, setFull] = useState(false);
  const overlay = useRef<HTMLDivElement>(null);
  const url = useRef<string | null>(null);
  const liveRun = useRef(0);
  const timer = useRef<number | null>(null);

  function stopLive() {
    liveRun.current += 1;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setLive(false);
  }

  function leaveFull() {
    setFull(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }

  /** Done looking (Xin, 21-10-2026): no more photos, and the camera block back to its button. */
  function close() {
    leaveFull();
    stopLive();
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
    setShot(null);
    setState("idle");
  }

  function choose(id: string) {
    if (id === chosen.current) return;
    close();
    chosen.current = id;
    setSelected(id);
  }

  // Where the browser allows it, really full screen; an iPhone only does that for video, so there the black
  // layer fills the window. Leaving the browser's full screen (a swipe, Esc) leaves ours too.
  useEffect(() => {
    if (!full) return;
    const element = overlay.current;
    if (element?.requestFullscreen && !document.fullscreenElement) void element.requestFullscreen().catch(() => undefined);
    const onChange = () => !document.fullscreenElement && setFull(false);
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setFull(false);
    const scroll = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = scroll;
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("keydown", onKey);
    };
  }, [full]);

  // Leaving the page or the app stops the photos; the blob goes with the page.
  useEffect(() => {
    const onHide = () => document.hidden && stopLive();
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      stopLive();
      if (url.current) URL.revokeObjectURL(url.current);
    };
  }, []);

  async function take(): Promise<boolean> {
    setState("loading");
    try {
      const res = await fetch(`/api/camera/${machineId}?camera=${encodeURIComponent(chosen.current)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const next = URL.createObjectURL(await res.blob());
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = next;
      setShot({ url: next, at: new Date() });
      setState("idle");
      return true;
    } catch {
      setState("error");
      return false;
    }
  }

  function startLive() {
    const run = ++liveRun.current;
    const until = Date.now() + LIVE_FOR_MS;
    setLive(true);
    const tick = async () => {
      if (liveRun.current !== run) return;
      if (Date.now() > until || document.hidden) return stopLive();
      const started = Date.now();
      // A camera that does not answer is not asked again and again.
      if (!(await take())) return stopLive();
      if (liveRun.current !== run) return;
      timer.current = window.setTimeout(tick, Math.max(500, LIVE_EVERY_MS - (Date.now() - started)));
    };
    void tick();
  }

  const loading = state === "loading";
  const alt = fmt(m.machines.cameraAlt, {
    name: cameras.length > 1 ? `${machineName}, ${cameras.find((c) => c.id === selected)?.name ?? ""}` : machineName,
  });
  const status = live
    ? shot
      ? fmt(m.machines.cameraLiveAt, { time: f.timeSeconds(shot.at) })
      : m.machines.cameraLiveHint
    : shot
      ? fmt(m.machines.cameraTakenAt, { time: f.time(shot.at) })
      : m.machines.cameraHint;

  return (
    <section className="surface-card px-5 py-5 sm:px-8 sm:py-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-[16px] font-semibold tracking-[-0.015em]">
            {m.machines.camera}
            {live && <span className="size-2 animate-pulse rounded-full bg-negative" aria-hidden="true" />}
          </h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground" aria-live="polite">
            {status}
          </p>
        </div>
        {cameras.length > 1 && (
          <div className="flex w-full flex-wrap gap-1.5" role="group" aria-label={m.machines.cameraWhich}>
            {cameras.map((camera) => (
              <button
                key={camera.id}
                type="button"
                aria-pressed={camera.id === selected}
                onClick={() => choose(camera.id)}
                className="h-9 rounded-full border border-border px-3.5 text-[13.5px] font-semibold text-muted-foreground transition-colors aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background"
              >
                {camera.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex w-full gap-2 sm:w-auto">
          {live ? (
            <Button onClick={close} className="flex-1 sm:flex-none">
              <Square />
              {m.machines.cameraLiveStop}
            </Button>
          ) : (
            <>
              <Button variant={shot ? "secondary" : "default"} onClick={() => void take()} disabled={loading} className="flex-1 sm:flex-none">
                {shot ? <RefreshCw className={loading ? "animate-spin" : undefined} /> : <Camera />}
                {loading ? m.machines.cameraLoading : shot ? m.machines.cameraAgain : m.machines.cameraShow}
              </Button>
              <Button variant="secondary" onClick={startLive} disabled={loading} className="flex-1 sm:flex-none">
                <Radio />
                {m.machines.cameraLive}
              </Button>
              {(shot || state === "error") && (
                <Button variant="ghost" onClick={close} className="flex-1 sm:flex-none">
                  <X />
                  {m.common.close}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
      {state === "error" && (
        <p role="alert" className="mt-3 text-sm font-medium text-negative">
          {m.machines.cameraError}
        </p>
      )}
      {shot && !full && (
        <div className="relative mt-4">
          {/* A blob from this page, not a file Next could optimise. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={shot.url}
            alt={alt}
            onClick={() => setFull(true)}
            className={`w-full cursor-zoom-in rounded-xl bg-surface object-contain transition-opacity ${loading && !live ? "opacity-60" : ""}`}
          />
          <button
            type="button"
            onClick={() => setFull(true)}
            aria-label={m.machines.cameraFullscreen}
            title={m.machines.cameraFullscreen}
            className="absolute right-2 top-2 grid size-10 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm hover:bg-black/70"
          >
            <Maximize2 className="size-[18px]" />
          </button>
        </div>
      )}
      {shot && full && (
        <div ref={overlay} role="dialog" aria-modal="true" aria-label={alt} className="fixed inset-0 z-[100] flex flex-col bg-black text-white">
          <div className="flex items-center gap-3 px-4 pb-2 pt-[max(12px,env(safe-area-inset-top))]">
            <p className="flex min-w-0 flex-1 items-center gap-2 text-[14px] font-semibold">
              {live && <span className="size-2 shrink-0 animate-pulse rounded-full bg-negative" aria-hidden="true" />}
              <span className="truncate">{status}</span>
            </p>
            {live && (
              <button type="button" onClick={close} className="h-10 rounded-full bg-white/15 px-4 text-[14px] font-semibold hover:bg-white/25">
                {m.machines.cameraLiveStop}
              </button>
            )}
            <button
              type="button"
              onClick={leaveFull}
              aria-label={m.machines.cameraFullscreenClose}
              title={m.machines.cameraFullscreenClose}
              className="grid size-10 place-items-center rounded-full bg-white/15 hover:bg-white/25"
            >
              <Minimize2 className="size-[18px]" />
            </button>
          </div>
          {/* Tapping the photo closes full screen as well. */}
          <div className="flex min-h-0 flex-1 items-center justify-center pb-[env(safe-area-inset-bottom)]" onClick={leaveFull}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shot.url} alt={alt} className="max-h-full max-w-full object-contain" />
          </div>
        </div>
      )}
    </section>
  );
}
