import { Video } from "lucide-react";

/**
 * Opens UniFi Protect's recording of a payment's moment in a new tab: an icon
 * next to the row, never inside the row's own link.
 */
export function RecordingLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-surface hover:text-foreground"
    >
      <Video className="size-[18px]" aria-hidden="true" />
    </a>
  );
}
