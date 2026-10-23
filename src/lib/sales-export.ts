import { fmt } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { getBusiness, getMachines, getOrgName, getProducts, getStatsReport } from "@/lib/data";
import { denyFiller, getScope, requireOrgId } from "@/lib/org";
import { withoutOrgName } from "@/lib/overview";
import { fillDays, periodDays, reportDay } from "@/lib/stats";
import { parseStatsParams } from "@/lib/stats-params";

export type ExportLine = { label: string; units: number; revenue: number };

/**
 * What a sales export holds, for the accountant (Xin, 21-10-2026: "export per date, or per month, whats been sold so
 * its easy to give to accounting"): the totals, every day of the period (also the ones that sold nothing), the months
 * when there are several, and what sold per product and per machine. PDF, Excel and CSV all write this one shape, so
 * the three can never tell a different story. It reads the same address as the Statistics page and goes through the
 * same report, with the same scoping.
 */
export type SalesExport = {
  brand: string;
  /** Whose sales: the organisation, or the business for a business's own login. */
  owner: string | null;
  /** "September 2026", "2026", or "1 sep. 2026 – 21 okt. 2026". */
  title: string;
  firstDay: string;
  /** The last day listed: never after today, so a running month does not list empty days to come. */
  lastDay: string;
  /** The filters of the page, as "Machine: Koekelare". */
  filters: string[];
  totals: { units: number; revenue: number };
  days: { day: string; units: number; revenue: number }[];
  /** Only when the period spans more than one month. */
  months: { month: string; units: number; revenue: number }[];
  products: ExportLine[];
  /**
   * Sales that carry no product (Gits's history, read in as day totals): one line, so the products still add up
   * to the total an accountant checks them against.
   */
  withoutProduct: ExportLine | null;
  machines: ExportLine[];
  /** "mato-info-verkoop-2026-09-01-2026-09-30", without the extension. */
  fileBase: string;
};

const pad = (n: number) => String(n).padStart(2, "0");
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function lastDayOf(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return `${month}-${pad(new Date(Date.UTC(year, m, 0)).getUTCDate())}`;
}

const slug = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export async function getSalesExport(search: URLSearchParams): Promise<SalesExport> {
  await denyFiller();
  const orgId = await requireOrgId();
  const { m, f } = await getI18n();
  const { machine, business, product, filters } = parseStatsParams(Object.fromEntries(search));
  const { businessId } = await getScope();

  const [report, orgName, machines, products, ownBusiness, askedBusiness] = await Promise.all([
    getStatsReport(orgId, filters),
    getOrgName(orgId),
    getMachines(orgId),
    product ? getProducts(orgId, { includeArchived: true }) : Promise.resolve([]),
    businessId ? getBusiness(orgId, businessId) : Promise.resolve(null),
    business && business !== businessId ? getBusiness(orgId, business) : Promise.resolve(null),
  ]);

  const today = reportDay(new Date(), report.timezone);
  const periodList = periodDays(report);
  const firstDay = periodList[0];
  const periodLast = periodList.at(-1) ?? firstDay;
  const lastDay = periodLast > today ? today : periodLast;
  const day = (d: string) => f.date(`${d}T12:00:00Z`);

  const title =
    firstDay === periodLast
      ? day(firstDay)
      : firstDay.endsWith("-01") && periodLast === lastDayOf(firstDay.slice(0, 7))
        ? capitalize(f.monthLongYear(firstDay.slice(0, 7)))
        : firstDay.endsWith("-01-01") && periodLast === `${firstDay.slice(0, 4)}-12-31`
          ? firstDay.slice(0, 4)
          : `${day(firstDay)} – ${day(periodLast)}`;

  const days = fillDays(report).filter((d) => d.day <= today);
  const monthMap = new Map<string, { month: string; units: number; revenue: number }>();
  for (const d of days) {
    const month = d.day.slice(0, 7);
    const row = monthMap.get(month) ?? { month, units: 0, revenue: 0 };
    row.units += d.units;
    row.revenue += d.revenue;
    monthMap.set(month, row);
  }
  const months = monthMap.size > 1 ? [...monthMap.values()] : [];

  const sold = <T extends { units: number; revenue: number }>(row: T) => row.units > 0 || Math.abs(row.revenue) > 0.005;
  const byRevenue = (a: ExportLine, b: ExportLine) => b.revenue - a.revenue || b.units - a.units || a.label.localeCompare(b.label);

  const productLines = report.by_product
    .filter(sold)
    .map((p) => ({ label: p.product_name ?? m.stats.unassignedProduct, units: p.units, revenue: p.revenue }))
    .sort(byRevenue);
  const rest = {
    units: report.totals.units - productLines.reduce((sum, p) => sum + p.units, 0),
    revenue: report.totals.revenue - productLines.reduce((sum, p) => sum + p.revenue, 0),
  };
  const withoutProduct = sold(rest) ? { label: m.salesExport.noDetail, ...rest } : null;

  const machineLines = report.by_machine
    .filter(sold)
    .map((row) => ({ label: withoutOrgName(row.machine_name, orgName), units: row.units, revenue: row.revenue }))
    .sort(byRevenue);

  const machineName = machine ? machines.find((mc) => mc.id === machine) : null;
  const productName = product ? products.find((p) => p.id === product) : null;
  const filterLines = [
    askedBusiness ? `${m.stats.business}: ${askedBusiness.name}` : null,
    machineName ? `${m.stats.machine}: ${withoutOrgName(machineName.name, orgName)}` : null,
    productName ? `${m.stats.product}: ${productName.name}` : null,
  ].filter((line): line is string => Boolean(line));

  const owner = ownBusiness?.name ?? orgName;
  return {
    brand: m.brand.name,
    owner,
    title,
    firstDay,
    lastDay,
    filters: filterLines,
    totals: { units: report.totals.units, revenue: report.totals.revenue },
    days,
    months,
    products: productLines,
    withoutProduct,
    machines: machineLines,
    fileBase: [slug(m.brand.name), m.salesExport.fileName, firstDay, lastDay].filter(Boolean).join("-"),
  };
}

/** "1 sep. 2026 t.e.m. 30 sep. 2026". */
export async function exportRange(data: SalesExport): Promise<string> {
  const { m, f } = await getI18n();
  return fmt(m.salesExport.range, { from: f.date(`${data.firstDay}T12:00:00Z`), to: f.date(`${data.lastDay}T12:00:00Z`) });
}

/** RFC 5987, so a browser keeps the name as it is. */
export function attachment(name: string): string {
  return `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
