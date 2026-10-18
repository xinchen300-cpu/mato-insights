"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { saveAvatar } from "@/app/(app)/refill/me/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { BEARDS, DEFAULT_LOOK, HAIR_COLORS, HAIR_STYLES, SHIRTS, SKINS, type AvatarLook } from "@/lib/avatar";
import { cn } from "@/lib/utils";
import { FillerAvatar } from "./avatar";

/**
 * Putting one's avatar together: a big preview, and a row of choices per part.
 * A few choices, not a game of its own (Xin, 19-10-2026: "customize a little bit").
 */
export function AvatarEditor({ initial, onClose }: { initial: AvatarLook | null; onClose: () => void }) {
  const { m } = useI18n();
  const t = m.me;
  const router = useRouter();
  const [look, setLook] = useState<AvatarLook>(initial ?? DEFAULT_LOOK);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const set = (change: Partial<AvatarLook>) => setLook((current) => ({ ...current, ...change }));

  function save() {
    setFailed(false);
    startTransition(async () => {
      try {
        await saveAvatar(look);
        router.refresh();
        onClose();
      } catch {
        setFailed(true);
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="gap-4">
        <DialogHeader>
          <DialogTitle>{t.avatarTitle}</DialogTitle>
        </DialogHeader>
        <span className="mx-auto block size-32 overflow-hidden rounded-full bg-primary/12">
          <FillerAvatar look={look} className="size-full" />
        </span>

        <Row label={t.avatarSkin}>
          {SKINS.map((color, i) => (
            <Swatch key={color} color={color} label={fmt(t.avatarColor, { n: i + 1 })} on={look.skin === i} onClick={() => set({ skin: i })} />
          ))}
        </Row>
        <Row label={t.avatarHair}>
          {HAIR_STYLES.map((hair) => (
            <Choice key={hair} label={t.hairStyles[hair]} on={look.hair === hair} onClick={() => set({ hair })}>
              <FillerAvatar look={{ ...look, hair }} className="size-full" />
            </Choice>
          ))}
        </Row>
        <Row label={t.avatarHairColor}>
          {HAIR_COLORS.map((color, i) => (
            <Swatch key={color} color={color} label={fmt(t.avatarColor, { n: i + 1 })} on={look.hairColor === i} onClick={() => set({ hairColor: i })} />
          ))}
        </Row>
        <Row label={t.avatarBeard}>
          {BEARDS.map((beard) => (
            <Choice key={beard} label={t.beards[beard]} on={look.beard === beard} onClick={() => set({ beard })}>
              <FillerAvatar look={{ ...look, beard }} className="size-full" />
            </Choice>
          ))}
        </Row>
        <Row label={t.avatarShirt}>
          {SHIRTS.map((color, i) => (
            <Swatch key={color} color={color} label={fmt(t.avatarColor, { n: i + 1 })} on={look.shirt === i} onClick={() => set({ shirt: i })} />
          ))}
        </Row>
        <Row label={t.avatarGlasses}>
          {[false, true].map((glasses) => (
            <button
              key={String(glasses)}
              type="button"
              aria-pressed={look.glasses === glasses}
              onClick={() => set({ glasses })}
              className={cn(
                "h-11 rounded-full px-5 text-[15px] font-semibold transition-colors",
                look.glasses === glasses ? "bg-foreground text-background" : "bg-surface",
              )}
            >
              {glasses ? t.glassesOn : t.glassesOff}
            </button>
          ))}
        </Row>

        {failed && <p className="text-[14px] font-medium text-negative">{m.common.error}</p>}
        <Button onClick={save} disabled={pending} className="h-12 w-full text-[16px]">
          {pending ? m.common.saving : m.common.save}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] font-semibold text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-2.5">{children}</div>
    </div>
  );
}

/** A colour to tap; the chosen one gets a ring and a tick. */
function Swatch({ color, label, on, onClick }: { color: string; label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "grid size-11 place-items-center rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)] transition-shadow",
        on && "ring-2 ring-foreground ring-offset-2 ring-offset-popover",
      )}
      style={{ backgroundColor: color }}
    >
      {on && <Check className="size-4 text-white mix-blend-difference" strokeWidth={3} aria-hidden="true" />}
    </button>
  );
}

/** A part to tap, shown on the avatar itself, so the choice needs no words. */
function Choice({ label, on, onClick, children }: { label: string; on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "size-14 overflow-hidden rounded-2xl bg-surface transition-shadow",
        on && "ring-2 ring-foreground ring-offset-2 ring-offset-popover",
      )}
    >
      {children}
    </button>
  );
}
