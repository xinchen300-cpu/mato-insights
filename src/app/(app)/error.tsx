"use client";

import { useEffect } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";

/**
 * Whatever breaks on a page stays inside the app, in the reader's language,
 * with a way to try again: never the framework's own English error page.
 */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const { m } = useI18n();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="pt-8">
      <EmptyState
        icon={<TriangleAlert className="size-5" />}
        title={m.errors.title}
        hint={m.errors.hint}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => retry()}>{m.errors.retry}</Button>
            <Link href="/" className={buttonVariants({ variant: "outline" })}>
              {m.errors.home}
            </Link>
          </div>
        }
      />
    </div>
  );
}
