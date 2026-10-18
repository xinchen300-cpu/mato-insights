"use client";

import AppError from "@/app/(app)/error";

/** A share link that fails shows the app's own error, in the reader's language, never the framework's English page. */
export default function ShareLinkError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="mx-auto w-full max-w-md px-4">
      <AppError {...props} />
    </main>
  );
}
