"use client";

import { useRef, useState } from "react";
import { ImageIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resizeImage } from "@/lib/resize-image";

// Controlled image field: the parent form reads `file` (already resized) and
// `removed` from props callbacks and adds them to its FormData.
export function ImagePicker({
  initialUrl,
  onChange,
  chooseLabel,
  changeLabel,
  removeLabel,
  square = true,
}: {
  initialUrl: string | null;
  onChange: (value: { file: File | null; removed: boolean }) => void;
  chooseLabel: string;
  changeLabel: string;
  removeLabel: string;
  square?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(initialUrl);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const resized = await resizeImage(file);
      setPreview(URL.createObjectURL(resized));
      onChange({ file: resized, removed: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div
        className={`grid shrink-0 place-items-center overflow-hidden rounded-2xl bg-surface p-1.5 shadow-[inset_0_0_0_1px_var(--border)] ${square ? "size-20" : "h-16 w-28"}`}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
        ) : (
          <ImageIcon className="size-6 text-muted-foreground/70" />
        )}
      </div>
      <div className="flex min-w-0 flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
          {preview ? changeLabel : chooseLabel}
        </Button>
        {preview && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setPreview(null);
              onChange({ file: null, removed: true });
              if (inputRef.current) inputRef.current.value = "";
            }}
          >
            <X />
            {removeLabel}
          </Button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
