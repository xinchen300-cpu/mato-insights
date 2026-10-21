"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** The vullijst as text: the phone's own share sheet (WhatsApp, mail), or copied where there is none. */
export function ShareList({ text, label, copied }: { text: string; label: string; copied: string }) {
  const [done, setDone] = useState(false);

  async function share() {
    if (navigator.share) {
      await navigator.share({ text }).catch(() => {});
      return;
    }
    await navigator.clipboard.writeText(text);
    setDone(true);
    setTimeout(() => setDone(false), 2000);
  }

  return (
    <Button variant="outline" onClick={share}>
      {done ? <Check /> : <Share2 />}
      {done ? copied : label}
    </Button>
  );
}
