"use client";

import { createPortal } from "react-dom";
import { Check } from "lucide-react";

/**
 * The big green check in the middle of the screen after saving (Xin, 21-10-2026: "in het midden van het scherm, in
 * het groot, een groen vinkje"). The caller decides how long it stays; a tap closes it sooner.
 */
export function SavedCheck({ text, onClose }: { text: string; onClose: () => void }) {
  return createPortal(
    <div
      aria-hidden="true"
      onClick={onClose}
      className="fixed inset-0 z-50 grid place-items-center bg-black/15 p-6 duration-200 animate-in fade-in-0"
    >
      <div className="flex w-full max-w-xs flex-col items-center gap-5 rounded-3xl bg-card px-6 py-8 shadow-[var(--shadow-pop)] duration-300 animate-in zoom-in-75">
        <span className="grid size-28 place-items-center rounded-full bg-positive text-white">
          <Check className="size-16" strokeWidth={3.25} />
        </span>
        <p className="text-center text-[19px] font-semibold leading-snug tracking-[-0.01em]">{text}</p>
      </div>
    </div>,
    document.body,
  );
}
