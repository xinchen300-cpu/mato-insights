import { VendlyWordmark } from "@/components/brand/vendly-mark";
import { LanguageToggle } from "@/components/shell/language-toggle";
import { fmt } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { getRefillSheetByToken } from "@/lib/data";
import { startRun } from "./actions";
import { FillerView } from "./filler-view";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.refill.sheetTitle, robots: { index: false, follow: false } };
}

// The filler's view: no login, just the unguessable link.
export default async function SharedRefillSheetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { m, f } = await getI18n();
  const existing = await getRefillSheetByToken(token);
  // Opening the sheet starts the run and refreshes its lines; a closed sheet is
  // left exactly as it was.
  if (existing && !existing.completed_at) await startRun(token);
  const sheet = existing && !existing.completed_at ? await getRefillSheetByToken(token) : existing;

  return (
    <div className="mx-auto min-h-svh max-w-2xl px-4 pt-4 sm:px-6 sm:pt-6">
      <header className="mb-8 flex h-10 items-center justify-between gap-3">
        <VendlyWordmark />
        <LanguageToggle />
      </header>

      {!sheet ? (
        <p className="surface-card px-6 py-12 text-center text-[15px] text-muted-foreground">{m.refill.notFound}</p>
      ) : (
        <>
          <p className="px-1 text-sm text-muted-foreground">
            {fmt(m.refill.createdAt, { date: f.dateTime(sheet.created_at) })}
          </p>
          <h1 className="mb-8 mt-1.5 px-1 text-[28px] font-semibold leading-tight tracking-[-0.03em] sm:text-[32px]">
            {m.refill.sheetTitle}
          </h1>
          <FillerView
            token={sheet.share_token}
            lines={sheet.lines}
            notes={sheet.notes}
            completed={Boolean(sheet.completed_at)}
          />
        </>
      )}
    </div>
  );
}
