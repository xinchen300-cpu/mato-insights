"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

/**
 * A password field with an eye that shows what was typed (Xin, 20-10-2026):
 * on a phone a mistyped password is otherwise a guess. Shown as text, the
 * keyboard must not capitalise or correct it, and Edge's own eye stays away
 * so there are never two.
 */
export function PasswordInput({ className, id, ...props }: Omit<React.ComponentProps<typeof Input>, "type">) {
  const { m } = useI18n();
  const [shown, setShown] = useState(false);
  const label = shown ? m.auth.hidePassword : m.auth.showPassword;

  return (
    <div className="relative">
      <Input
        id={id}
        type={shown ? "text" : "password"}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        // After className: its px-4 would otherwise win over the room for the eye.
        className={cn(className, "pr-12 [&::-ms-reveal]:hidden")}
        {...props}
      />
      <button
        type="button"
        onClick={() => setShown((now) => !now)}
        aria-label={label}
        title={label}
        aria-controls={id}
        className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-xl text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ring"
      >
        {shown ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
      </button>
    </div>
  );
}
