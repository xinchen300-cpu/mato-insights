"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePicker } from "@/components/image-picker";
import { useI18n } from "@/i18n/client";
import { mediaUrl } from "@/lib/media";
import { updateMachinePhoto } from "../actions";

/** The tile photo, saved as soon as it is picked: no separate save button to forget. */
export function MachinePhotoForm({ machineId, photoPath }: { machineId: string; photoPath: string | null }) {
  const { m } = useI18n();
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [isPending, startTransition] = useTransition();

  function save({ file, removed }: { file: File | null; removed: boolean }) {
    const data = new FormData();
    if (file) data.set("photo", file);
    if (removed) data.set("removePhoto", "1");
    setStatus("idle");
    startTransition(async () => {
      try {
        await updateMachinePhoto(machineId, data);
        setStatus("saved");
        router.refresh();
      } catch {
        setStatus("error");
      }
    });
  }

  return (
    <div className="grid gap-3">
      <div>
        <p className="text-[15px] font-semibold tracking-[-0.01em]">{m.machines.photo}</p>
        <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{m.machines.photoHint}</p>
      </div>
      <ImagePicker
        initialUrl={mediaUrl(photoPath)}
        onChange={save}
        chooseLabel={m.products.choosePhoto}
        changeLabel={m.products.changePhoto}
        removeLabel={m.products.removePhoto}
        square={false}
      />
      {isPending && <span className="text-sm text-muted-foreground">{m.common.saving}</span>}
      {!isPending && status === "saved" && <span className="text-sm font-medium text-positive">{m.common.saved}</span>}
      {status === "error" && <span className="text-sm font-medium text-negative">{m.common.error}</span>}
    </div>
  );
}
