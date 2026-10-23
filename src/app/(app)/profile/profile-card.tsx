"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil } from "lucide-react";
import { FillerAvatar } from "@/components/filler/avatar";
import { AvatarEditor } from "@/components/filler/avatar-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/client";
import type { AvatarLook } from "@/lib/avatar";
import { saveProfileName } from "./actions";

/** The top of the profile: the avatar, to put together or change, and one's name, to change. */
export function ProfileCard({ look, name, email }: { look: AvatarLook | null; name: string | null; email: string | null }) {
  const { m } = useI18n();
  const t = m.profile;
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name ?? "");
  const [state, setState] = useState<"idle" | "saved" | "invalid" | "failed">("idle");
  const [pending, startTransition] = useTransition();
  const changed = value.trim() !== (name ?? "");

  function save(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      try {
        const { ok } = await saveProfileName(value);
        setState(ok ? "saved" : "invalid");
        if (ok) router.refresh();
      } catch {
        setState("failed");
      }
    });
  }

  return (
    <div className="surface-card flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:gap-7 sm:p-6">
      <div className="flex flex-col items-center gap-3">
        <span className="grid size-28 place-items-center overflow-hidden rounded-full bg-primary/12">
          {look ? (
            <FillerAvatar look={look} className="size-full" />
          ) : (
            <span className="text-[40px] font-bold uppercase text-muted-foreground">{(name || email || "?").charAt(0)}</span>
          )}
        </span>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <Pencil />
          {look ? m.me.avatarEdit : m.me.avatarMake}
        </Button>
      </div>
      <form onSubmit={save} className="flex min-w-0 flex-1 flex-col gap-2">
        <label htmlFor="profile-name" className="text-[13px] font-semibold text-muted-foreground">
          {t.name}
        </label>
        <div className="flex gap-2">
          <Input
            id="profile-name"
            value={value}
            maxLength={40}
            autoComplete="name"
            onChange={(event) => {
              setValue(event.target.value);
              setState("idle");
            }}
            className="h-11 text-base"
          />
          <Button type="submit" className="h-11" disabled={pending || !changed || !value.trim()}>
            {state === "saved" && !changed ? <Check /> : null}
            {state === "saved" && !changed ? m.common.saved : m.common.save}
          </Button>
        </div>
        <p className={state === "invalid" || state === "failed" ? "text-[13px] text-destructive" : "text-[13px] text-muted-foreground"}>
          {state === "invalid" ? t.nameInvalid : state === "failed" ? m.errors.title : t.nameHint}
        </p>
        {email && <p className="truncate text-[14px] text-muted-foreground">{email}</p>}
      </form>
      {editing && <AvatarEditor initial={look} onClose={() => setEditing(false)} />}
    </div>
  );
}
