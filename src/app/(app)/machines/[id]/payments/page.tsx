import Link from "next/link";
import { notFound } from "next/navigation";
import { Link2 } from "lucide-react";
import { Avatar, ListRow, RowList, initial } from "@/components/list-row";
import { EmptyState, PageHeader, Section } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { fmt, weekdayIndex } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { getMachine, getPayments } from "@/lib/data";
import { denyFiller, requireOrgId } from "@/lib/org";
import type { PaymentEntry } from "@/lib/types";
import { AutoRefresh } from "@/components/auto-refresh";

const PER_PAGE = 100;

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.status.allPayments };
}

/**
 * Every payment of one machine, newest first and a hundred at a time, grouped
 * by day the way a bank lists them: paid, refused or broken off, each at what
 * the customer tried to pay.
 */
export default async function PaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ p?: string }>;
}) {
  await denyFiller();
  const { id } = await params;
  const { p } = await searchParams;
  const { m, f } = await getI18n();
  const orgId = await requireOrgId();
  const machine = await getMachine(orgId, id);
  if (!machine) notFound();

  const page = Math.max(1, Math.min(1000, Number.parseInt(p ?? "1", 10) || 1));
  const { rows, more } = await getPayments(orgId, id, { limit: PER_PAGE, offset: (page - 1) * PER_PAGE });
  const reasonLabels = m.status.reasons as Record<string, string>;

  // One section per day, in the order the payments came.
  const days: { day: string; label: string; rows: PaymentEntry[] }[] = [];
  for (const payment of rows) {
    const last = days[days.length - 1];
    if (last && last.day === f.date(payment.occurred_at)) last.rows.push(payment);
    else
      days.push({
        day: f.date(payment.occurred_at),
        label: `${m.weekdays[weekdayIndex(payment.occurred_at)]} ${f.dayMonth(payment.occurred_at)}`,
        rows: [payment],
      });
  }

  return (
    <>
      <AutoRefresh />
      <PageHeader backHref={`/machines/${id}`} backLabel={machine.name} title={m.status.allPayments} />
      {rows.length === 0 ? (
        <EmptyState title={m.status.noPayments} />
      ) : (
        <div className="flex flex-col gap-8">
          {days.map((group) => (
            <Section key={group.day} title={group.label}>
              <RowList>
                {group.rows.map((payment, i) => {
                  const paid = payment.disposition === "APPROVED";
                  return (
                    <li key={`${payment.occurred_at}-${i}`}>
                      <ListRow
                        leading={
                          <Avatar tone={paid ? "neutral" : "negative"}>
                            {payment.product_name ? initial(payment.product_name) : <Link2 />}
                          </Avatar>
                        }
                        title={
                          payment.product_name ??
                          (payment.selection_number ? fmt(m.expiry.selection, { number: payment.selection_number }) : "—")
                        }
                        subtitle={`${f.time(payment.occurred_at)} · ${
                          paid ? m.status.paid : (reasonLabels[payment.disposition] ?? payment.disposition)
                        }`}
                        value={
                          <span className={paid ? undefined : "font-medium text-muted-foreground line-through"}>
                            {f.euro(payment.amount)}
                          </span>
                        }
                      />
                    </li>
                  );
                })}
              </RowList>
            </Section>
          ))}
          <div className="flex flex-wrap gap-2">
            {page > 1 && (
              <Link
                href={page === 2 ? `/machines/${id}/payments` : `/machines/${id}/payments?p=${page - 1}`}
                className={buttonVariants({ variant: "outline" })}
              >
                {m.status.newer}
              </Link>
            )}
            {more && (
              <Link href={`/machines/${id}/payments?p=${page + 1}`} className={buttonVariants({ variant: "outline" })}>
                {m.status.older}
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
