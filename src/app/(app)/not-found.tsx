import Link from "next/link";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { getI18n } from "@/i18n/server";

/** A page that is not there, or not the reader's to see: said the same way, inside the app. */
export default async function AppNotFound() {
  const { m } = await getI18n();
  return (
    <div className="pt-8">
      <EmptyState
        icon={<SearchX className="size-5" />}
        title={m.errors.notFoundTitle}
        hint={m.errors.notFoundHint}
        action={
          <Link href="/" className={buttonVariants()}>
            {m.errors.home}
          </Link>
        }
      />
    </div>
  );
}
