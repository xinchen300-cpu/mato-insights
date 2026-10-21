import { Video } from "lucide-react";
import { recordingUrl, type LinkedCamera } from "@/lib/camera-link";

// A phone (touch, no hover): UniFi's website plays no recordings there and its app cannot be opened at a
// moment, so the icon stays away and RecordingHint says it works on a computer (Xin, 21-10-2026).
const notOnPhone = "[@media(hover:none)_and_(pointer:coarse)]:hidden";
const onPhoneOnly = "hidden [@media(hover:none)_and_(pointer:coarse)]:block";

const iconClass = `flex size-11 shrink-0 cursor-pointer list-none items-center justify-center rounded-xl text-muted-foreground hover:bg-surface hover:text-foreground [&::-webkit-details-marker]:hidden ${notOnPhone}`;

/**
 * Opens UniFi Protect's recording of a payment's moment in a new tab: an icon
 * next to the row, never inside the row's own link. A machine with several
 * cameras (21-10-2026) gets a small list of them under the same icon. Not on
 * a phone: see RecordingHint.
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
  if (cameras.length === 0) return null;
  if (cameras.length === 1) {
    return (
      <a href={recordingUrl(cameras[0], at)} target="_blank" rel="noopener noreferrer" aria-label={label} title={label} className={iconClass}>
        <Video className="size-[18px]" aria-hidden="true" />
      </a>
    );
  }
  return (
    <details className={`relative shrink-0 ${notOnPhone}`}>
      <summary aria-label={label} title={label} className={iconClass}>
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
    </details>
  );
}

/** On a phone, where the icons are gone: one line that recordings are watched on a computer. */
export function RecordingHint({ text, className }: { text: string; className?: string }) {
  return <p className={`${onPhoneOnly} text-[13px] text-muted-foreground ${className ?? ""}`}>{text}</p>;
}
