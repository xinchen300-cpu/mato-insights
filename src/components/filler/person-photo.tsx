"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { savePersonPhoto } from "@/app/(app)/refill/fillers/actions";
import { useI18n } from "@/i18n/client";
import { resizeImage } from "@/lib/resize-image";
import { cn } from "@/lib/utils";

/**
 * A person's round photo, or the first letter of their name. The operator taps
 * it to choose a photo; it is made small on the phone first and saved at once,
 * with no separate save button to forget.
 */
export function PersonPhoto({
  userId,
  name,
  url,
  className,
}: {
  /** The account to put the photo on; without it the letter stays and nothing can be chosen. */
  userId: string | null;
  name: string;
  url: string | null;
  className?: string;
}) {
  const { m } = useI18n();
  const t = m.fillers;
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(url);
  const [failed, setFailed] = useState(false);
  const [busy, startTransition] = useTransition();

  async function choose(file: File | undefined) {
    if (!file || !userId) return;
    setFailed(false);
    const small = await resizeImage(file, 400);
    const shown = URL.createObjectURL(small);
    setPreview(shown);
    startTransition(async () => {
      try {
        const data = new FormData();
        data.set("photo", small);
        await savePersonPhoto(userId, data);
        router.refresh();
      } catch {
        setPreview(url);
        setFailed(true);
      }
    });
  }

  const face = (
    <span
      className={cn(
        "relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/12 text-[19px] font-semibold text-[#8a6117]",
        busy && "opacity-60",
        className,
      )}
    >
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="" className="size-full object-cover" />
      ) : (
        name.trim().charAt(0).toUpperCase() || "·"
      )}
    </span>
  );

  if (!userId) return <span aria-hidden="true">{face}</span>;
  return (
    <span className="relative shrink-0">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-label={preview ? t.photoChange : t.photoAdd}
        title={failed ? t.photoFailed : preview ? t.photoChange : t.photoAdd}
        className="block rounded-full transition-transform active:scale-95"
      >
        {face}
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 grid size-6 place-items-center rounded-full ring-2 ring-card",
            failed ? "bg-negative text-white" : "bg-foreground text-background",
          )}
          aria-hidden="true"
        >
          <Camera className="size-3.5" />
        </span>
      </button>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(event) => choose(event.target.files?.[0])} />
    </span>
  );
}
