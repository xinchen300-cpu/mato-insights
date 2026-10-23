"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Camera, Maximize2, Minimize2, Radio, RefreshCw, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmt } from "@/i18n/format";
import { useI18n } from "@/i18n/client";
import { LIVE_EVERY_MS, NEXT_HEADER } from "@/lib/camera-pace";

/** "Live" (Xin, 21-10-2026; first called "Bijna live"): a new photo every few seconds, never longer than a minute. */
const LIVE_FOR_MS = 60_000;

/** What one request for a photo gave: a photo and the wait before the next, a wait, or nothing. */
type Taken = { kind: "photo"; every: number } | { kind: "busy"; wait: number } | { kind: "error" };

/**
 * "Toon automaat nu" (Xin, 20-10-2026): a photo of this moment from the UniFi
 * camera aimed at the machine. Only on a tap, never by itself, so the camera
 * is asked only when someone looks; the photo lives in this page and is gone
 * when it closes. "Live" repeats it every few seconds for a minute, and
 * stops sooner when the page is left or two photos in a row fail. Since
 * 22-10-2026 it waits as long as the server says: longer when several people
 * watch, and when UniFi's minute is full it says so and carries on after.
 * A machine with several cameras (21-10-2026) shows one at a time, picked above
 * the buttons. On the overview (21-10-2026) it carries the machine in its
 * title, and a choice of machine when more than one has a camera.
 */
export function MachineCamera({
  machineId,
  machineName,
  cameras,
  title,
  picker,
}: {
  machineId: string;
  machineName: string;
  cameras: { id: string; name: string }[];
  /** Instead of "Camera", e.g. "Camera · Diksmuide" on the overview. */
  title?: string;
  /** A row above the camera choice, e.g. which machine on the overview. */
  picker?: ReactNode;
}) {
  const { m, f } = useI18n();
  const [selected, setSelected] = useState(cameras[0]?.id ?? "");
  // The live loop reads the camera from here, so switching never mixes two cameras.
  const chosen = useRef(selected);
  const [shot, setShot] = useState<{ url: string; at: Date } | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error" | "busy">("idle");
  // Seconds UniFi asked to wait (22-10-2026): the console's minute is full.
  const [busyFor, setBusyFor] = useState(0);
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

  async function take(): Promise<Taken> {
    setState("loading");
    try {
      const res = await fetch(`/api/camera/${machineId}?camera=${encodeURIComponent(chosen.current)}`, { cache: "no-store" });
      if (res.status === 429) {
        const seconds = Math.max(1, Number(res.headers.get("Retry-After")) || 10);
        setBusyFor(seconds);
        setState("busy");
        return { kind: "busy", wait: seconds * 1000 };
      }
      if (!res.ok) throw new Error(String(res.status));
      const next = URL.createObjectURL(await res.blob());
      // Decoded before it is shown, so Live never flashes an empty frame between two photos.
      const image = new Image();
      image.src = next;
      await image.decode().catch(() => undefined);
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = next;
      setShot({ url: next, at: new Date() });
      setState("idle");
      return { kind: "photo", every: Math.max(LIVE_EVERY_MS, Number(res.headers.get(NEXT_HEADER)) || 0) };
    } catch {
      return { kind: "error" };
    }
  }

  async function takeOne() {
    if ((await take()).kind === "error") setState("error");
  }

  function startLive() {
    const run = ++liveRun.current;
    const until = Date.now() + LIVE_FOR_MS;
    setLive(true);
    let missed = false;
    const tick = async () => {
      if (liveRun.current !== run) return;
      if (Date.now() > until || document.hidden) return stopLive();
      const started = Date.now();
      const taken = await take();
      if (liveRun.current !== run) return;
      if (taken.kind === "error") {
        // One failed photo is tried once more; a camera that keeps failing is not asked again and again.
        if (missed) {
          setState("error");
          return stopLive();
        }
        missed = true;
      } else {
        missed = false;
      }
      // The server's pace (slower when several people watch), UniFi's wait, or a second after a miss.
      const wait = taken.kind === "photo" ? taken.every - (Date.now() - started) : taken.kind === "busy" ? taken.wait : 1_000;
      timer.current = window.setTimeout(tick, Math.max(500, wait));
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
            {title ?? m.machines.camera}
            {live && <span className="size-2 animate-pulse rounded-full bg-negative" aria-hidden="true" />}
          </h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground" aria-live="polite">
            {status}
          </p>
        </div>
        {picker}
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
              <Button variant={shot ? "secondary" : "default"} onClick={() => void takeOne()} disabled={loading} className="flex-1 sm:flex-none">
                {shot ? <RefreshCw className={loading ? "animate-spin" : undefined} /> : <Camera />}
                {loading ? m.machines.cameraLoading : shot ? m.machines.cameraAgain : m.machines.cameraShow}
              </Button>
              <Button variant="secondary" onClick={startLive} disabled={loading} className="flex-1 sm:flex-none">
                <Radio />
                {m.machines.cameraLive}
              </Button>
              {(shot || state === "error" || state === "busy") && (
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
      {state === "busy" && (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          {fmt(m.machines.cameraBusy, { seconds: busyFor })}
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
      {/* In the body, not in the page: the page's arrival animation (template.tsx) holds anything fixed inside it to
          the page's own size, under the top bar and the tab bar (Xin, 22-10-2026: "not covering the screen"). */}
      {shot &&
        full &&
        createPortal(
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
          </div>,
          document.body,
        )}
    </section>
  );
}
