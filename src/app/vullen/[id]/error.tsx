"use client";

import AppError from "@/app/(app)/error";

/** A round that cannot load shows the app's own error, in the filler's language, never the framework's English page. */
export default function RoundError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="mx-auto w-full max-w-md px-4">
      <AppError {...props} />
    </main>
  );
}
