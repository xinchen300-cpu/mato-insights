import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheck, FileSpreadsheet, Printer } from "lucide-react";
import { PageHeader, Panel } from "@/components/page-header";
import { SheetTables } from "@/components/refill/sheet-tables";
import { buttonVariants } from "@/components/ui/button";
import { fmt } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { getRefillSheet } from "@/lib/data";
import { requireOrgId } from "@/lib/org";
import { NotesForm } from "./notes-form";
import { ShareBox } from "./share-box";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.refill.sheetTitle };
}

export default async function RefillSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { m, f } = await getI18n();
  const orgId = await requireOrgId();

  const sheet = await getRefillSheet(orgId, id);
  if (!sheet) notFound();

  const total = sheet.lines.reduce((sum, l) => sum + l.to_add, 0);

  return (
    <>
      <PageHeader
        backHref="/refill"
        backLabel={m.refill.title}
        eyebrow={fmt(m.refill.createdAt, { date: f.dateTime(sheet.created_at) })}
        title={m.refill.sheetTitle}
        subtitle={fmt(m.refill.items, { count: total })}
        actions={
          <>
            <Link href={`/print/refill/${sheet.id}`} target="_blank" className={buttonVariants({ variant: "outline" })}>
              <Printer />
              {m.refill.print}
            </Link>
            <a href={`/refill/${sheet.id}/csv`} className={buttonVariants({ variant: "outline" })}>
              <FileSpreadsheet />
              {m.refill.csv}
            </a>
          </>
        }
      />

      {sheet.completed_at && (
        <p className="mb-6 flex items-center gap-2 border border-positive/40 bg-card p-4 font-semibold text-positive">
          <CircleCheck className="size-5" />
          {fmt(m.refill.completedAt, { date: f.dateTime(sheet.completed_at) })}
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <SheetTables lines={sheet.lines} m={m} />
        <div className="flex flex-col gap-6 lg:sticky lg:top-24 lg:self-start">
          {!sheet.completed_at && (
            <Panel title={m.refill.share}>
              <ShareBox token={sheet.share_token} />
            </Panel>
          )}
          <Panel title={m.refill.notes}>
            <NotesForm sheetId={sheet.id} initialNotes={sheet.notes ?? ""} />
          </Panel>
        </div>
      </div>
    </>
  );
}
