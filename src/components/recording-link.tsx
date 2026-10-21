"use client";

import { useState, type MouseEvent } from "react";
import { Video } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { recordingUrl, type LinkedCamera } from "@/lib/camera-link";

const iconClass =
  "flex size-11 shrink-0 cursor-pointer list-none items-center justify-center rounded-xl text-muted-foreground hover:bg-surface hover:text-foreground [&::-webkit-details-marker]:hidden";

/**
 * On a phone, UniFi's website shows no recordings; only the UniFi Protect app
 * does, and Ubiquiti offers no link into the app at a moment (Xin, 21-10-2026).
 * iPads present themselves as a Mac and keep the website, which works there.
 */
function onPhone(): boolean {
  return /Android|iPhone|iPod/i.test(navigator.userAgent);
}

/** The app's page in the phone's own store, which says "Open" when it is installed. */
function appStoreUrl(): string {
  return /Android/i.test(navigator.userAgent)
    ? "https://play.google.com/store/apps/details?id=com.ubnt.unifi.protect"
    : "https://apps.apple.com/app/id1392492235";
}

/**
 * Opens UniFi Protect's recording of a payment's moment in a new tab: an icon
 * next to the row, never inside the row's own link. A machine with several
 * cameras (21-10-2026) gets a small list of them under the same icon. On a
 * phone the icon opens a sheet instead, with the camera and the exact time to
 * look up in the UniFi Protect app.
 */
export function RecordingLink({
  cameras,
  at,
  label,
  unnamed,
}: {
  cameras: LinkedCamera[];
  at: string;
  /** "Watch the recording at 14:32 in UniFi Protect". */
  label: string;
  /** What a camera without a name is called. */
  unnamed: string;
}) {
  const { m, f } = useI18n();
  const [sheet, setSheet] = useState(false);
  if (cameras.length === 0) return null;

  const nameOf = (camera: LinkedCamera, i: number) => camera.name ?? `${unnamed} ${i + 1}`;
  const onPhoneOpen = (event: MouseEvent) => {
    if (!onPhone()) return;
    event.preventDefault();
    setSheet(true);
  };
  const names = cameras.map(nameOf).join(", ");

  return (
    <>
      {cameras.length === 1 ? (
        <a
          href={recordingUrl(cameras[0], at)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          title={label}
          className={iconClass}
          onClick={onPhoneOpen}
        >
          <Video className="size-[18px]" aria-hidden="true" />
        </a>
      ) : (
        <details className="relative shrink-0">
          <summary aria-label={label} title={label} className={iconClass} onClick={onPhoneOpen}>
            <Video className="size-[18px]" aria-hidden="true" />
          </summary>
          <ul className="surface-card absolute right-0 top-full z-20 mt-1 flex min-w-40 flex-col p-1.5 shadow-lg">
            {cameras.map((camera, i) => (
              <li key={camera.cameraId}>
                <a
                  href={recordingUrl(camera, at)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover-surface flex min-h-11 items-center gap-2 rounded-lg px-3 text-[14px] font-medium"
                >
                  <Video className="size-4 text-muted-foreground" aria-hidden="true" />
                  {nameOf(camera, i)}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
      {sheet && (
        <Dialog open onOpenChange={(open) => !open && setSheet(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{m.machines.recordingTitle}</DialogTitle>
              <DialogDescription>{m.machines.recordingPhone}</DialogDescription>
            </DialogHeader>
            <div className="rounded-2xl bg-surface px-4 py-3.5">
              <p className="text-[19px] font-semibold tabular-nums">{f.timeSeconds(at)}</p>
              <p className="text-[14px] first-letter:uppercase">{f.weekdayDay(at)}</p>
              <p className="mt-1.5 text-[13.5px] text-muted-foreground">
                {fmt(cameras.length === 1 ? m.machines.recordingCamera : m.machines.recordingCameras, { names })}
              </p>
            </div>
            <DialogFooter className="sm:flex-col sm:items-stretch">
              <a href={appStoreUrl()} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "lg" })}>
                {m.machines.recordingApp}
              </a>
              <p className="order-first text-center text-[13px] text-muted-foreground sm:order-none">{m.machines.recordingAppHint}</p>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
