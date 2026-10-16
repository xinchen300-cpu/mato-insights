import Link from "next/link";
import { InsightsWordmark } from "@/components/brand/insights-mark";
import { buttonVariants } from "@/components/ui/button";
import { getI18n } from "@/i18n/server";

/** An address that leads nowhere, outside the app's own pages: plain, in the reader's language. */
export default async function NotFound() {
  const { m } = await getI18n();
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <InsightsWordmark className="h-7 w-auto text-[#2a2520]" />
      <h1 className="mt-6 text-[24px] font-semibold tracking-[-0.02em]">{m.errors.notFoundTitle}</h1>
      <p className="text-[15px] text-muted-foreground">{m.errors.notFoundHint}</p>
      <Link href="/" className={buttonVariants({ className: "mt-2" })}>
        {m.errors.home}
      </Link>
    </main>
  );
}
