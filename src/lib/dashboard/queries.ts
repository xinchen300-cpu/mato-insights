import { createAdminClient } from "@/lib/supabase/admin";

export type DailyRevenue = { day: string; revenue: number; tx_count: number };
export type MachineRevenue = {
  machine_id: string;
  machine_name: string | null;
  location_name: string | null;
  revenue: number;
  tx_count: number;
};
export type ItemRevenue = { item_ref: string; revenue: number; tx_count: number };
export type MachineLastSale = {
  machine_id: string;
  machine_name: string | null;
  location_name: string | null;
  last_sale: string | null;
};
export type PeriodTotals = { revenue: number; tx_count: number };

export async function getDashboardData(orgId: string, days = 30) {
  const supabase = createAdminClient();

  const now = new Date();
  const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const prevPeriodStart = new Date(periodStart.getTime() - days * 24 * 60 * 60 * 1000);

  const [daily, byMachine, byItem, lastSales, currentTotals, previousTotals, itemLabels] =
    await Promise.all([
      supabase.rpc("dashboard_daily_revenue", { target_org: orgId, days }),
      supabase.rpc("dashboard_machine_revenue", { target_org: orgId, days }),
      supabase.rpc("dashboard_item_revenue", { target_org: orgId, days }),
      supabase.rpc("dashboard_machine_last_sale", { target_org: orgId }),
      supabase.rpc("dashboard_period_totals", {
        target_org: orgId,
        period_start: periodStart.toISOString(),
        period_end: now.toISOString(),
      }),
      supabase.rpc("dashboard_period_totals", {
        target_org: orgId,
        period_start: prevPeriodStart.toISOString(),
        period_end: periodStart.toISOString(),
      }),
      supabase.from("item_labels").select("item_ref, product_name").eq("org_id", orgId),
    ]);

  return {
    daily: (daily.data ?? []) as DailyRevenue[],
    byMachine: (byMachine.data ?? []) as MachineRevenue[],
    byItem: (byItem.data ?? []) as ItemRevenue[],
    lastSales: (lastSales.data ?? []) as MachineLastSale[],
    currentTotals: (currentTotals.data?.[0] ?? { revenue: 0, tx_count: 0 }) as PeriodTotals,
    previousTotals: (previousTotals.data?.[0] ?? { revenue: 0, tx_count: 0 }) as PeriodTotals,
    itemLabels: new Map(
      (itemLabels.data ?? []).map((l) => [l.item_ref, l.product_name] as const),
    ),
  };
}
