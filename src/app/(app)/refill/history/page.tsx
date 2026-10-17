import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader, Section } from "@/components/page-header";
import { RefillTabs } from "@/components/refill/refill-tabs";
import { RoundFigures } from "@/components/refill/round-figures";
import { figuresOf, RoundList } from "@/components/refill/round-list";
import { buttonVariants } from "@/components/ui/button";
import { fmt } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { getMachines, getRefillSheets } from "@/lib/data";
import { denyFiller, isOperator, requireOrgId } from "@/lib/org";
import { DISPOSITIONS, type RoundFigures as Figures } from "@/lib/refill-flow";

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
          <RoundList sheets={rows.map((row) => row.sheet)} names={name} m={m} f={f} />
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
