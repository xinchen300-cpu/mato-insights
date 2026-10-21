"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { Video } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { recordingUrl, type LinkedCamera } from "@/lib/camera-link";

// A phone (touch, no hover): UniFi's website plays no recordings there and its app cannot be opened at a
// moment (Xin, 21-10-2026). The icon stays, but a tap shows a note instead of opening the website, and
// RecordingHint says the same above the list.
const PHONE = "(hover: none) and (pointer: coarse)";
const onPhoneOnly = "hidden [@media(hover:none)_and_(pointer:coarse)]:block";

const iconClass =
  "flex size-11 shrink-0 cursor-pointer list-none items-center justify-center rounded-xl text-muted-foreground hover:bg-surface hover:text-foreground [&::-webkit-details-marker]:hidden";

/** How long the note stays after a tap on a phone. */
const NOTE_MS = 3_000;

/**
 * Opens UniFi Protect's recording of a payment's moment in a new tab: an icon
 * next to the row, never inside the row's own link. A machine with several
 * cameras (21-10-2026) gets a small list of them under the same icon. On a
 * phone a tap only says it works on a computer.
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
  const { m } = useI18n();
  const [note, setNote] = useState(false);
  useEffect(() => {
    if (!note) return;
    const timer = window.setTimeout(() => setNote(false), NOTE_MS);
    return () => window.clearTimeout(timer);
  }, [note]);
  if (cameras.length === 0) return null;

  const onPhoneTap = (event: MouseEvent) => {
    if (!window.matchMedia(PHONE).matches) return;
    event.preventDefault();
    setNote(true);
  };
  const toast =
    note &&
    createPortal(
      <p
        role="status"
        className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-sm rounded-2xl bg-foreground px-4 py-3 text-center text-[14px] font-medium text-background shadow-lg"
      >
        {m.machines.cameraOnlyComputer}
      </p>,
      document.body,
    );

  if (cameras.length === 1) {
    return (
      <>
        <a
          href={recordingUrl(cameras[0], at)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          title={label}
          className={iconClass}
          onClick={onPhoneTap}
        >
          <Video className="size-[18px]" aria-hidden="true" />
        </a>
        {toast}
      </>
    );
  }
  return (
    <details className="relative shrink-0">
      <summary aria-label={label} title={label} className={iconClass} onClick={onPhoneTap}>
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
              {camera.name ?? `${unnamed} ${i + 1}`}
            </a>
          </li>
        ))}
      </ul>
      {toast}
    </details>
  );
}

/** On a phone: one line above the list that recordings are watched on a computer. */
export function RecordingHint({ text, className }: { text: string; className?: string }) {
  return <p className={`${onPhoneOnly} text-[13px] text-muted-foreground ${className ?? ""}`}>{text}</p>;
}
