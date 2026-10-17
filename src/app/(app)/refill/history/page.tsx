import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, CircleCheck, ClipboardList } from "lucide-react";
import { Avatar } from "@/components/list-row";
import { PageHeader, Section } from "@/components/page-header";
import { RefillTabs } from "@/components/refill/refill-tabs";
import { RoundFigures } from "@/components/refill/round-figures";
import { buttonVariants } from "@/components/ui/button";
import { fmt } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { getMachines, getRefillSheets } from "@/lib/data";
import { denyFiller, isOperator, requireOrgId } from "@/lib/org";
import { DISPOSITIONS, itemReport, roundFigures, type RoundFigures as Figures } from "@/lib/refill-flow";
import type { RefillSheet } from "@/lib/types";

const PAGE = 30;

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.refill.allRounds };
}

/**
 * Every round, newest first, each under its own number and with what it came
 * to: out of the stock, into the machines, to Too Good To Go and in the bin.
 * The operator's: a round can carry a co-tenant's slots.
 */
export default async function RoundHistoryPage({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  await denyFiller();
  if (!(await isOperator())) redirect("/refill");
  const { m, f } = await getI18n();
  const orgId = await requireOrgId();
  const page = Math.max(1, Math.floor(Number((await searchParams).pagina) || 1));
  // One more than a page tells whether there is an older one, without counting them all.
  const [sheets, machines] = await Promise.all([
    getRefillSheets(orgId, { limit: PAGE + 1, offset: (page - 1) * PAGE }),
    getMachines(orgId),
  ]);
  const name = new Map(machines.map((machine) => [machine.id, machine.name]));
  // A closed step-by-step round has its own figures; an old one filled through a link only its plan.
  const figuresOf = (sheet: RefillSheet): Figures | null =>
    sheet.flow_version === 2 && sheet.completed_at
      ? roundFigures(itemReport(sheet.lines, sheet.box ?? {}, sheet.stops ?? {}, sheet.returns ?? [], []))
      : null;
  const rows = sheets.slice(0, PAGE).map((sheet) => ({ sheet, figures: figuresOf(sheet) }));
  const counted = rows.flatMap((row) => (row.figures ? [row.figures] : []));
  const together = counted.reduce<Figures>(
    (sum, one) => ({
      taken: sum.taken + one.taken,
      filled: sum.filled + one.filled,
      short: sum.short + one.short,
      went: Object.fromEntries(DISPOSITIONS.map((where) => [where, sum.went[where] + one.went[where]])) as Figures["went"],
    }),
    { taken: 0, filled: 0, short: 0, went: { stock: 0, waste: 0, promo: 0, staff: 0, other: 0 } },
  );

  return (
    <>
      <PageHeader title={m.refill.allRounds} subtitle={m.refill.allRoundsHint} actions={<RefillTabs active="rounds" m={m} />} />
      <div className="flex flex-col gap-10">
        {counted.length > 1 && (
          <Section title={fmt(m.refill.roundsTogether, { n: counted.length })}>
            <RoundFigures figures={together} m={m} />
          </Section>
        )}

        {rows.length === 0 ? (
          <p className="px-1 text-sm text-muted-foreground">{m.refill.recentEmpty}</p>
        ) : (
          <ul className="stagger flex flex-col gap-3">
            {rows.map(({ sheet, figures }) => {
              const open = !sheet.completed_at && Boolean(sheet.started_at);
              const planned = sheet.lines.reduce((sum, line) => sum + line.to_add, 0);
              return (
                <li key={sheet.id}>
                  <Link
                    href={`/refill/${sheet.id}`}
                    className="surface-card hover-surface flex flex-col gap-3 p-4 transition-transform duration-150 active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar tone={sheet.completed_at ? "positive" : open ? "warning" : "neutral"}>
                        {sheet.completed_at ? <CircleCheck /> : <ClipboardList />}
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-[15.5px] font-semibold tracking-[-0.01em]">
                          {sheet.number ? fmt(m.refill.roundNumber, { n: sheet.number }) : f.dateTime(sheet.created_at)}
                        </p>
                        <p className="truncate text-[13px] text-muted-foreground">
                          {[
                            sheet.number ? f.dateTime(sheet.created_at) : null,
                            sheet.machine_ids.map((id) => name.get(id)).filter(Boolean).join(", "),
                            sheet.filled_by,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground/70" aria-hidden="true" />
                    </div>
                    {figures ? (
                      <RoundFigures figures={figures} m={m} size="small" />
                    ) : (
                      <p className="tabular text-[13.5px] text-muted-foreground">
                        {[fmt(m.refill.items, { count: planned }), open ? m.refill.runOpen : null].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {(page > 1 || sheets.length > PAGE) && (
          <nav className="flex items-center justify-between gap-3">
            {page > 1 ? (
              <Link href={page === 2 ? "/refill/history" : `/refill/history?pagina=${page - 1}`} className={buttonVariants({ variant: "outline" })}>
                <ChevronLeft />
                {m.refill.newerRounds}
              </Link>
            ) : (
              <span />
            )}
            {sheets.length > PAGE && (
              <Link href={`/refill/history?pagina=${page + 1}`} className={buttonVariants({ variant: "outline" })}>
                {m.refill.olderRounds}
                <ChevronRight />
              </Link>
            )}
          </nav>
        )}
      </div>
    </>
  );
}
