import { createAdminClient } from "@/lib/supabase/admin";
import { getScope } from "@/lib/org";
import type {
  Producer,
  RunSummaryRow,
  Shortage,
  Business,
  BusinessFreshness,
  ExpiryAlert,
  LayoutTemplate,
  Machine,
  MachineSalesSplit,
  PaymentEntry,
  PaymentHealth,
  Period,
  Product,
  RecentSale,
  RefillEvent,
  RefillSheet,
  SlotStock,
  ShelfLifePreset,
  SlowMover,
  StatsReport,
  UnassignedGroup,
  WasteRow,
} from "@/lib/types";

// Server-only data access. Every query is scoped to an org id that the caller
// resolved from the session (or, until login exists, the single org).

export type StatsFilters = {
  period: Period;
  from?: string | null;
  to?: string | null;
  machines?: string[] | null;
  businesses?: string[] | null;
  products?: string[] | null;
};

/**
 * An id no row can carry. A filter narrowed down to nothing has to stay
 * nothing: passing null here would mean "no filter", which is the whole fleet.
 */
const NOTHING = "00000000-0000-0000-0000-000000000000";

/** The machine ids the caller may see, or null when they see the whole fleet. */
async function ownMachineIds(orgId: string): Promise<string[] | null> {
  const { businessId } = await getScope();
  if (!businessId) return null;
  return (await getMachines(orgId)).map((m) => m.id);
}

/** null means "no filter"; an empty list means the caller asked for someone else's. */
function narrow(asked: string[] | null | undefined, allowed: string[] | null): string[] | null {
  if (allowed === null) return asked?.length ? asked : null;
  const kept = asked?.length ? asked.filter((id) => allowed.includes(id)) : allowed;
  return kept.length ? kept : [NOTHING];
}

export async function getStatsReport(orgId: string, filters: StatsFilters): Promise<StatsReport> {
  // A membership tied to one business narrows every report to it, whatever the
  // page asked for — the filter is enforced here, not at the call site. Asking
  // for a business, machine or product that is not yours answers with nothing.
  const { businessId } = await getScope();
  const [ownMachines, ownProducts] = businessId
    ? await Promise.all([getMachines(orgId), getProducts(orgId)])
    : [null, null];

  const { data, error } = await createAdminClient().rpc("stats_report", {
    target_org: orgId,
    period: filters.period,
    custom_from: filters.from ?? null,
    custom_to: filters.to ?? null,
    machine_filter: narrow(filters.machines, ownMachines && ownMachines.map((m) => m.id)),
    business_filter: narrow(filters.businesses, businessId ? [businessId] : null),
    product_filter: narrow(filters.products, ownProducts && ownProducts.map((p) => p.id)),
  });
  if (error) throw new Error(error.message);
  return data as StatsReport;
}

// One literal: Supabase types the result by parsing this string.
const MACHINE_COLUMNS =
  "id, name, type, payter_serial_number, business_id, shared_business_id, data_since, km_round_trip, last_connected_at, last_disconnected_at, terminal_model, terminal_network, terminal_flags, businesses!machines_business_id_fkey(name, logo_path)";

export async function getMachines(orgId: string): Promise<Machine[]> {
  const { businessId } = await getScope();
  let query = createAdminClient()
    .from("machines")
    .select(MACHINE_COLUMNS)
    .eq("org_id", orgId)
    .eq("excluded", false);
  // A shared machine belongs to its second business just as much.
  if (businessId) query = query.or(`business_id.eq.${businessId},shared_business_id.eq.${businessId}`);
  const { data, error } = await query.order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map(toMachine);
}

export async function getMachine(orgId: string, id: string): Promise<Machine | null> {
  const { businessId } = await getScope();
  const { data } = await createAdminClient()
    .from("machines")
    .select(MACHINE_COLUMNS)
    .eq("org_id", orgId)
    .eq("excluded", false)
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const machine = toMachine(data);
  // Guessing a machine id must not open someone else's machine.
  if (businessId && machine.business_id !== businessId && machine.shared_business_id !== businessId) {
    return null;
  }
  return machine;
}

type MachineRow = {
  id: string;
  name: string;
  type: Machine["type"];
  payter_serial_number: string | null;
  business_id: string | null;
  shared_business_id: string | null;
  data_since: string | null;
  km_round_trip: number | string | null;
  last_connected_at: string | null;
  last_disconnected_at: string | null;
  terminal_model: string | null;
  terminal_network: string | null;
  terminal_flags: string[] | null;
  businesses: { name: string; logo_path: string | null } | { name: string; logo_path: string | null }[] | null;
};

function toMachine(row: MachineRow): Machine {
  const business = Array.isArray(row.businesses) ? row.businesses[0] : row.businesses;
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    payter_serial_number: row.payter_serial_number,
    business_id: row.business_id,
    shared_business_id: row.shared_business_id,
    business_name: business?.name ?? null,
    business_logo_path: business?.logo_path ?? null,
    data_since: row.data_since,
    km_round_trip: row.km_round_trip === null ? null : Number(row.km_round_trip),
    last_connected_at: row.last_connected_at,
    last_disconnected_at: row.last_disconnected_at,
    terminal_model: row.terminal_model,
    terminal_network: row.terminal_network,
    terminal_flags: row.terminal_flags ?? [],
  };
}

export async function getMachineStock(orgId: string, machineIds?: string[]): Promise<SlotStock[]> {
  const { data, error } = await createAdminClient().rpc("machine_stock", {
    target_org: orgId,
    machine_filter: machineIds?.length ? machineIds : null,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as SlotStock[];
}

/** Per machine: payments that went through and those that did not, since a date. */
export async function getPaymentHealth(orgId: string, since: Date): Promise<Map<string, PaymentHealth>> {
  const { data, error } = await createAdminClient().rpc("payment_health", {
    target_org: orgId,
    since: since.toISOString(),
  });
  if (error) throw new Error(error.message);
  return new Map(
    ((data ?? []) as PaymentHealth[]).map((h) => [
      h.machine_id,
      {
        ...h,
        approved: Number(h.approved),
        declined: Number(h.declined),
        failed: Number(h.failed),
        declined_amount: Number(h.declined_amount),
        failed_amount: Number(h.failed_amount),
      },
    ]),
  );
}

/** The machine's latest payments: the ones that worked and the ones that did not. */
export async function getPaymentFeed(orgId: string, machineId: string, limit = 12): Promise<PaymentEntry[]> {
  const { data, error } = await createAdminClient().rpc("payment_feed", {
    target_org: orgId,
    target_machine: machineId,
    max_rows: limit,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as PaymentEntry[]).map((p) => ({ ...p, amount: Number(p.amount) }));
}

export async function getMachineSalesSplit(
  orgId: string,
  machineId: string,
  since: Date,
): Promise<MachineSalesSplit[]> {
  const { data, error } = await createAdminClient().rpc("machine_sales_split", {
    target_org: orgId,
    target_machine: machineId,
    since: since.toISOString(),
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as MachineSalesSplit[]).map((r) => ({
    ...r,
    units: Number(r.units),
    revenue: Number(r.revenue),
  }));
}

export async function getLastSales(orgId: string): Promise<Map<string, string | null>> {
  const { data } = await createAdminClient().rpc("dashboard_machine_last_sale", { target_org: orgId });
  return new Map(
    ((data ?? []) as { machine_id: string; last_sale: string | null }[]).map((r) => [r.machine_id, r.last_sale]),
  );
}

export const PRODUCT_COLUMNS =
  "id, name, price, photo_path, archived, business_id, shelf_life_days, shelf_life_preset_id, producer_id";

export async function getProducts(orgId: string, { includeArchived = false } = {}): Promise<Product[]> {
  const { businessId } = await getScope();
  let query = createAdminClient()
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("org_id", orgId)
    .order("name");
  if (businessId) query = query.eq("business_id", businessId);
  if (!includeArchived) query = query.eq("archived", false);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => ({ ...p, price: p.price === null ? null : Number(p.price) }));
}

export async function getShelfLifePresets(orgId: string): Promise<ShelfLifePreset[]> {
  const { data, error } = await createAdminClient()
    .from("shelf_life_presets")
    .select("id, name, days")
    .eq("org_id", orgId)
    .order("days");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getProductSlotCounts(orgId: string): Promise<Map<string, number>> {
  const { data } = await createAdminClient()
    .from("selection_assignments")
    .select("product_id")
    .eq("org_id", orgId)
    .is("valid_to", null);
  const counts = new Map<string, number>();
  for (const row of data ?? []) counts.set(row.product_id, (counts.get(row.product_id) ?? 0) + 1);
  return counts;
}

const BUSINESS_COLUMNS = "id, name, logo_path, started_on, contact_name, email, phone, notes, share_token";

export async function getBusiness(orgId: string, id: string): Promise<Business | null> {
  // A guessed id must not open another customer's contact details or share link.
  const { businessId } = await getScope();
  if (businessId && id !== businessId) return null;
  const { data } = await createAdminClient()
    .from("businesses")
    .select(BUSINESS_COLUMNS)
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  return data ?? null;
}

/** The customer's own read-only page: no login, just the unguessable link. */
export async function getBusinessByToken(token: string): Promise<(Business & { org_id: string }) | null> {
  if (!token) return null;
  const { data } = await createAdminClient()
    .from("businesses")
    .select(`${BUSINESS_COLUMNS}, org_id`)
    .eq("share_token", token)
    .maybeSingle();
  return data ?? null;
}

/** Which machines each business sells from — both businesses of a shared machine. */
export function businessMachineIds(machines: Machine[]): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const mc of machines) {
    for (const businessId of [mc.business_id, mc.shared_business_id]) {
      if (!businessId) continue;
      const set = result.get(businessId) ?? new Set<string>();
      set.add(mc.id);
      result.set(businessId, set);
    }
  }
  return result;
}

export async function getRecentSales(orgId: string, businessId: string): Promise<RecentSale[]> {
  const { data, error } = await createAdminClient().rpc("business_recent_sales", {
    target_org: orgId,
    target_business: businessId,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as RecentSale[]).map((s) => ({ ...s, amount: Number(s.amount) }));
}

export async function getBusinesses(orgId: string): Promise<Business[]> {
  const { businessId } = await getScope();
  let query = createAdminClient()
    .from("businesses")
    .select(BUSINESS_COLUMNS)
    .eq("org_id", orgId);
  if (businessId) query = query.eq("id", businessId);
  const { data, error } = await query.order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Slots with stock over date or going over within the day, worst first. */
export async function getExpiryAlerts(orgId: string): Promise<ExpiryAlert[]> {
  const { businessId } = await getScope();
  const { data, error } = await createAdminClient().rpc("expiry_alerts", { target_org: orgId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as ExpiryAlert[])
    .filter((a) => !businessId || a.business_id === businessId)
    .map((a) => ({
    ...a,
    qty_expired: Number(a.qty_expired),
    qty_expiring_24h: Number(a.qty_expiring_24h),
    hours_left: a.hours_left === null ? null : Number(a.hours_left),
  }));
}

/** Slots where a full load cannot sell out before its date. */
export async function getSlowMovers(orgId: string): Promise<SlowMover[]> {
  const { businessId } = await getScope();
  const { data, error } = await createAdminClient().rpc("slow_movers", { target_org: orgId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as SlowMover[])
    .filter((s) => !businessId || s.business_id === businessId)
    .map((s) => ({
    ...s,
    units_per_day: Number(s.units_per_day),
    days_to_sell_full: s.days_to_sell_full === null ? null : Number(s.days_to_sell_full),
  }));
}

/**
 * What went in the bin instead of over the counter, per product. A shop
 * account only ever sees its own products — the narrowing happens here, so no
 * screen can forget it.
 */
export async function getWasteReport(orgId: string, daysBack = 60): Promise<WasteRow[]> {
  const { businessId } = await getScope();
  const { data, error } = await createAdminClient().rpc("waste_report", {
    target_org: orgId,
    days_back: daysBack,
    business_filter: businessId,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as WasteRow[]).map((row) => ({
    ...row,
    qty_expired: Number(row.qty_expired),
    qty_sold: Number(row.qty_sold),
    value_expired: Number(row.value_expired),
    value_sold: Number(row.value_sold),
    share_expired: row.share_expired === null ? null : Number(row.share_expired),
  }));
}

export async function getBusinessFreshness(orgId: string, businessId: string): Promise<BusinessFreshness | null> {
  const { data, error } = await createAdminClient().rpc("business_freshness", {
    target_org: orgId,
    target_business: businessId,
  });
  if (error) throw new Error(error.message);
  const row = ((data ?? []) as BusinessFreshness[])[0];
  return row
    ? { ...row, qty_expired: Number(row.qty_expired), qty_expiring_24h: Number(row.qty_expiring_24h) }
    : null;
}

export async function getUnassigned(orgId: string): Promise<UnassignedGroup[]> {
  const mine = await ownMachineIds(orgId);
  const { data, error } = await createAdminClient().rpc("unassigned_sales", { target_org: orgId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as UnassignedGroup[])
    .filter((g) => !mine || mine.includes(g.machine_id))
    .map((g) => ({
    ...g,
    sales: Number(g.sales),
    revenue: Number(g.revenue),
    typical_price: g.typical_price === null ? null : Number(g.typical_price),
  }));
}

export async function getCurrentAssignments(orgId: string, machineId: string): Promise<Map<string, string>> {
  const { data } = await createAdminClient()
    .from("selection_assignments")
    .select("selection_number, product_id")
    .eq("org_id", orgId)
    .eq("machine_id", machineId)
    .is("valid_to", null);
  return new Map((data ?? []).map((a) => [a.selection_number, a.product_id]));
}

export async function getRefillHistory(orgId: string, machineId: string): Promise<RefillEvent[]> {
  const { data } = await createAdminClient()
    .from("stock_events")
    .select("occurred_at, type, delta, refill_sheet_id, filled_by")
    .eq("org_id", orgId)
    .eq("machine_id", machineId)
    .order("occurred_at", { ascending: false })
    .limit(500);

  // One refill or correction writes a row per slot with the same timestamp.
  const events = new Map<string, RefillEvent>();
  for (const row of data ?? []) {
    const key = `${row.occurred_at}|${row.type}`;
    const event = events.get(key) ?? {
      occurred_at: row.occurred_at,
      type: row.type,
      refill_sheet_id: row.refill_sheet_id,
      filled_by: row.filled_by,
      added: 0,
      slots: 0,
    };
    event.added += Math.max(row.delta, 0);
    event.slots += 1;
    events.set(key, event);
  }
  return [...events.values()].slice(0, 30);
}

export async function getLayoutTemplates(orgId: string): Promise<LayoutTemplate[]> {
  const { data } = await createAdminClient()
    .from("layout_templates")
    .select("id, org_id, name, machine_type, layout")
    .or(`org_id.is.null,org_id.eq.${orgId}`)
    .order("created_at");
  return (data ?? []) as LayoutTemplate[];
}

export async function getRefillSheets(orgId: string): Promise<RefillSheet[]> {
  const mine = await ownMachineIds(orgId);
  const { data } = await createAdminClient()
    .from("refill_sheets")
    .select("id, share_token, machine_ids, notes, lines, created_at, started_at, completed_at, filled_by, km, box")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(mine ? 60 : 10);
  const sheets = (data ?? []) as RefillSheet[];
  // A run belongs to whoever owns the machines it visited.
  if (!mine) return sheets;
  return sheets.filter((sheet) => sheet.machine_ids.some((id) => mine.includes(id))).slice(0, 10);
}

export async function getRefillSheet(orgId: string, id: string): Promise<RefillSheet | null> {
  const mine = await ownMachineIds(orgId);
  const { data } = await createAdminClient()
    .from("refill_sheets")
    .select("id, share_token, machine_ids, notes, lines, created_at, started_at, completed_at, filled_by, km, box")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  const sheet = (data as RefillSheet) ?? null;
  // Guessing a sheet id must not print another customer's run.
  if (!sheet || !mine) return sheet;
  return sheet.machine_ids.some((machineId) => mine.includes(machineId)) ? sheet : null;
}

// Public: the share link carries the unguessable token instead of a login.
export async function getRefillSheetByToken(token: string): Promise<RefillSheet | null> {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return null;
  const { data } = await createAdminClient()
    .from("refill_sheets")
    .select("id, share_token, machine_ids, notes, lines, created_at, started_at, completed_at, filled_by, km, box")
    .eq("share_token", token)
    .maybeSingle();
  return (data as RefillSheet) ?? null;
}

export async function getLastSyncedAt(orgId: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .from("payter_credentials")
    .select("last_synced_at")
    .eq("org_id", orgId)
    .maybeSingle();
  return data?.last_synced_at ?? null;
}

/** What the fridge came up short on, newest first, over the last 60 days. */
export async function getShortages(orgId: string, days = 60): Promise<Shortage[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { businessId } = await getScope();
  let query = createAdminClient()
    .from("run_shortages")
    .select("qty, noted_at, product_id, products!inner(name, business_id)")
    .eq("org_id", orgId)
    .gte("noted_at", since);
  if (businessId) query = query.eq("products.business_id", businessId);
  const { data } = await query.order("noted_at", { ascending: false });

  return (data ?? []).map((row) => {
    const product = row.products as unknown as { name: string } | null;
    return {
      product_id: row.product_id,
      product_name: product?.name ?? null,
      qty: row.qty,
      noted_at: row.noted_at,
    };
  });
}

/** Who makes the food, so a shortage or a batch going off has an address. */
export async function getProducers(orgId: string): Promise<Producer[]> {
  const { businessId } = await getScope();
  const { data } = await createAdminClient()
    .from("producers")
    .select("id, name, email, phone, notes")
    .eq("org_id", orgId)
    .order("name");
  const producers = (data ?? []) as Producer[];
  if (!businessId) return producers;
  // A shop only knows the producers behind its own products.
  const mine = new Set((await getProducts(orgId)).map((product) => product.producer_id).filter(Boolean));
  return producers.filter((producer) => mine.has(producer.id));
}

/** The report that closes a run: filled, out of date and short, per product. */
export async function getRunSummary(orgId: string, sheetId: string): Promise<RunSummaryRow[]> {
  const { data, error } = await createAdminClient().rpc("run_summary", {
    target_org: orgId,
    sheet: sheetId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as RunSummaryRow[];
}

/** Refuses unless the caller's scope contains this machine. */
export async function requireMachineAccess(orgId: string, machineId: string): Promise<void> {
  if (!(await getMachine(orgId, machineId))) throw new Error("Not found");
}

/** Refuses unless the caller's scope contains this product. */
export async function requireProductAccess(orgId: string, productId: string): Promise<void> {
  const { businessId } = await getScope();
  if (!businessId) return;
  const { data } = await createAdminClient()
    .from("products")
    .select("business_id")
    .eq("org_id", orgId)
    .eq("id", productId)
    .maybeSingle();
  if (!data || data.business_id !== businessId) throw new Error("Not found");
}
