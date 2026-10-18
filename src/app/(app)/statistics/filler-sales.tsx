import { TriangleAlert } from "lucide-react";
import { HourChart } from "@/components/charts/hour-chart";
import { Avatar, ListRow, initial } from "@/components/list-row";
import { PageHeader, Panel, Section } from "@/components/page-header";
import { fmt, plural } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import type { Messages } from "@/i18n/messages";
import { getSoldReport, type SoldReport } from "@/lib/data";
import { mediaUrl } from "@/lib/media";

/**
 * What sells and when, for whoever fills (Xin, 17-10-2026): the best sellers
 * and the busiest hours of the last 30 days, in pieces. No euros anywhere:
 * the report comes without them.
 */
export async function FillerSales({ orgId }: { orgId: string }) {
  const { m } = await getI18n();
  return <SoldView report={await getSoldReport(orgId)} m={m} />;
}

/** The page itself, from a report that has no amounts in it. */
export function SoldView({ report, m }: { report: SoldReport; m: Messages }) {
  const best = report.products.slice(0, 10);

  return (
    <>
      <PageHeader title={m.nav.sales} subtitle={m.periods.last30} />
      <div className="flex flex-col gap-8">
        {/* Said once, above the product list it is about. */}
        {report.mixed.length > 0 && (
          <div className="surface-card flex items-start gap-3.5 p-4 sm:p-5">
            <Avatar tone="warning">
              <TriangleAlert />
            </Avatar>
            <p className="max-w-[62ch] pt-0.5 text-[15px] leading-snug">{fmt(m.stats.mixedBody, { machines: report.mixed.join(", ") })}</p>
          </div>
        )}

        <Section title={m.stats.bestSellers}>
          {best.length === 0 ? (
            <p className="surface-card px-5 py-5 text-sm text-muted-foreground">{m.stats.noSales}</p>
          ) : (
            // An ordered list: the order is the point.
            <ol className="surface-card flex flex-col p-2">
              {best.map((row, i) => (
                <li key={row.productId}>
                  <ListRow
                    leading={
                      <span className="flex shrink-0 items-center gap-2.5">
                        <span className="tabular-nums w-4 text-center text-[13px] font-semibold text-muted-foreground">{i + 1}</span>
                        <Avatar>
                          {row.photoPath ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={mediaUrl(row.photoPath)!} alt="" className="max-h-7 max-w-7 object-contain" />
                          ) : (
                            initial(row.name ?? "")
                          )}
                        </Avatar>
                      </span>
                    }
                    title={row.name}
                    value={plural(row.units, m.common.unitsOne, m.common.unitsOther)}
                  />
                </li>
              ))}
            </ol>
          )}
        </Section>

        <Panel title={m.stats.busiestHours}>
          <HourChart data={report.hours} measure="units" />
        </Panel>
      </div>
    </>
  );
}
