import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { denyFillerAccess, getScope, isFiller, isOperator, requireOperator, requireRefillAccess, type Role } from "@/lib/org";
import { displayName } from "@/lib/people";
import { onlyMine, roundTimings, slotKey, type Average, type FlowLine, type RoundTimings, type ShopView, type StopRecord } from "@/lib/refill-flow";
import { terminalStatus, type TerminalStatus } from "@/lib/terminal-status";
import { DISPLAY_TIME_ZONE } from "@/i18n/format";
import { reportDay } from "@/lib/stats";
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
  RefillLine,
  RefillSheet,
  SlotStock,
  ShelfLifePreset,
  SlowMover,
  StatsReport,
  UnassignedGroup,
  WasteRow,
  PriceMismatch,
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

/** What a shop may see of a run: its machines, its products, its slots right now. */
async function shopView(orgId: string, businessId: string, machines: string[]): Promise<ShopView> {
  const admin = createAdminClient();
  const [{ data: products }, { data: slots }] = await Promise.all([
    admin.from("products").select("id").eq("org_id", orgId).eq("business_id", businessId),
    admin.rpc("machine_stock", { target_org: orgId, machine_filter: machines.length ? machines : [NOTHING] }),
  ]);
  return {
    machines,
    products: new Set((products ?? []).map((row) => row.id as string)),
    slots: new Set(
      ((slots ?? []) as SlotStock[])
        .filter((slot) => slot.business_id === businessId)
        .map((slot) => slotKey(slot.machine_id, slot.selection_number)),
    ),
  };
}

/** The machine ids the caller may see, or null when they see the whole fleet. */
async function ownMachineIds(orgId: string): Promise<string[] | null> {
  const { businessId } = await getScope();
  if (!businessId) return null;
  return (await getMachines(orgId)).map((m) => m.id);
}

/**
 * The business the caller is confined to. Always sent, even when the page asked
 * for nothing, and never null — null would mean the whole fleet.
 */
function onlyBusiness(asked: string[] | null | undefined, businessId: string): string[] {
  if (!asked?.length) return [businessId];
  return asked.includes(businessId) ? [businessId] : [NOTHING];
}

/**
 * A machine or product the page asked for, checked against what the caller may
 * see. Asking for nothing sends no filter at all: the business filter already
 * does the scoping, and a list here would quietly drop sales of archived
 * products and of selections that are not linked to anything.
 */
function onlyAsked(asked: string[] | null | undefined, allowed: string[] | null): string[] | null {
  if (!asked?.length) return null;
  if (allowed === null) return asked;
  const kept = asked.filter((id) => allowed.includes(id));
  return kept.length ? kept : [NOTHING];
}

export async function getStatsReport(orgId: string, filters: StatsFilters): Promise<StatsReport> {
  await denyFillerAccess();
  // A membership tied to one business narrows every report to it, whatever the
  // page asked for — the filter is enforced here, not at the call site. Asking
  // for a business, machine or product that is not yours answers with nothing.
  const { businessId } = await getScope();
  const [ownMachines, ownProducts] = businessId
    ? await Promise.all([
        filters.machines?.length ? getMachines(orgId) : null,
        filters.products?.length ? getProducts(orgId) : null,
      ])
    : [null, null];

  const { data, error } = await createAdminClient().rpc("stats_report", {
    target_org: orgId,
    period: filters.period,
    custom_from: filters.from ?? null,
    custom_to: filters.to ?? null,
    machine_filter: onlyAsked(filters.machines, ownMachines && ownMachines.map((m) => m.id)),
    business_filter: businessId
      ? onlyBusiness(filters.businesses, businessId)
      : filters.businesses?.length
        ? filters.businesses
        : null,
    product_filter: onlyAsked(filters.products, ownProducts && ownProducts.map((p) => p.id)),
  });
  if (error) throw new Error(error.message);
  return data as StatsReport;
}

export type RoundMachine = { id: string; name: string; status: TerminalStatus; lastSale: string | null };
/** Every slot of a machine on the round, for "something is wrong here" on any slot, planned or not. */
export type RoundSlot = {
  machineId: string;
  selection: string;
  row: number;
  slot: number;
  productId: string;
  productName: string | null;
  capacity: number;
  stock: number | null;
};

export type RefillRound = {
  id: string;
  flowVersion: number;
  createdAt: string;
  startedAt: string | null;
  readyAt: string | null;
  completedAt: string | null;
  /** In the order of the round. */
  machines: RoundMachine[];
  lines: FlowLine[];
  slots: RoundSlot[];
  picked: Record<string, number>;
  stops: Record<string, StopRecord>;
};

/** What Vendly knows is in a slot, or null when it cannot know (never counted, or oversold since). */
function knownStock(slot: SlotStock): number | null {
  if (slot.stock === null || slot.level_after === null) return null;
  if (slot.sales_since > slot.level_after) return null;
  return slot.stock;
}

/**
 * One refill round for whoever fills it: the operator or a filler of this
 * organisation, never a shop. Products, slots and counts only: no prices, no
 * revenue, so a filler's screen carries no money at all.
 */
export async function getRefillRound(orgId: string, sheetId: string): Promise<RefillRound | null> {
  if ((await requireRefillAccess()) !== orgId) throw new Error("Not found");
  const admin = createAdminClient();
  const { data: sheet } = await admin
    .from("refill_sheets")
    .select("id, flow_version, created_at, started_at, ready_at, completed_at, machine_ids, lines, box, stops")
    .eq("id", sheetId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!sheet) return null;

  const machineIds = (sheet.machine_ids ?? []) as string[];
  const [{ data: machineRows }, stock, lastSales] = await Promise.all([
    admin
      .from("machines")
      .select("id, name, last_connected_at, last_disconnected_at")
      .eq("org_id", orgId)
      .in("id", machineIds.length ? machineIds : [NOTHING]),
    getMachineStock(orgId, machineIds.length ? machineIds : [NOTHING]),
    getLastSales(orgId),
  ]);
  const byId = new Map((machineRows ?? []).map((row) => [row.id as string, row]));
  const live = new Map(stock.map((slot) => [slotKey(slot.machine_id, slot.selection_number), slot]));

  const lines: FlowLine[] = ((sheet.lines ?? []) as RefillLine[])
    .filter((line) => byId.has(line.machine_id))
    .map((line) => {
      const now = live.get(slotKey(line.machine_id, line.selection_number));
      return {
        machineId: line.machine_id,
        selection: line.selection_number,
        row: line.row_position,
        slot: line.slot_position,
        productId: line.product_id,
        productName: line.product_name,
        photoPath: line.photo_path,
        capacity: now?.capacity ?? line.capacity,
        stock: now ? knownStock(now) : null,
        take: Math.min(line.capacity, line.to_add + (line.qty_expired ?? 0)),
        expired: line.qty_expired ?? 0,
      };
    });

  return {
    id: sheet.id as string,
    flowVersion: Number(sheet.flow_version ?? 1),
    createdAt: sheet.created_at as string,
    startedAt: (sheet.started_at as string | null) ?? null,
    readyAt: (sheet.ready_at as string | null) ?? null,
    completedAt: (sheet.completed_at as string | null) ?? null,
    machines: machineIds
      .filter((id) => byId.has(id))
      .map((id) => {
        const row = byId.get(id)!;
        return {
          id,
          name: row.name as string,
          status: terminalStatus(row.last_connected_at as string | null, row.last_disconnected_at as string | null),
          lastSale: lastSales.get(id) ?? null,
        };
      }),
    lines,
    slots: stock
      .filter((slot) => slot.product_id)
      .sort((a, b) => a.row_position - b.row_position || a.slot_position - b.slot_position)
      .map((slot) => ({
        machineId: slot.machine_id,
        selection: slot.selection_number,
        row: slot.row_position,
        slot: slot.slot_position,
        productId: slot.product_id as string,
        productName: slot.product_name,
        capacity: slot.capacity,
        stock: knownStock(slot),
      })),
    picked: (sheet.box ?? {}) as Record<string, number>,
    stops: (sheet.stops ?? {}) as Record<string, StopRecord>,
  };
}

export type OpenRound = {
  id: string;
  createdAt: string;
  readyAt: string | null;
  /** Who started it ("Start ronde"), as they gave their name. */
  filledBy: string | null;
  machines: { id: string; name: string; done: boolean; doneAt: string | null; skipped: boolean }[];
};

/**
 * Step-by-step rounds that are not finished yet, for whoever fills them: the
 * operator or a filler. Names and progress only.
 */
export async function getOpenRounds(orgId: string): Promise<OpenRound[]> {
  if ((await requireRefillAccess()) !== orgId) throw new Error("Not found");
  const admin = createAdminClient();
  const { data: sheets } = await admin
    .from("refill_sheets")
    .select("id, created_at, ready_at, machine_ids, stops, filled_by")
    .eq("org_id", orgId)
    .eq("flow_version", 2)
    .is("completed_at", null)
    .order("created_at", { ascending: false })
    .limit(20);
  const ids = [...new Set((sheets ?? []).flatMap((sheet) => (sheet.machine_ids ?? []) as string[]))];
  const { data: machines } = await admin
    .from("machines")
    .select("id, name")
    .eq("org_id", orgId)
    .in("id", ids.length ? ids : [NOTHING]);
  const name = new Map((machines ?? []).map((row) => [row.id as string, row.name as string]));
  return (sheets ?? []).map((sheet) => {
    const stops = (sheet.stops ?? {}) as Record<string, StopRecord>;
    return {
      id: sheet.id as string,
      createdAt: sheet.created_at as string,
      readyAt: (sheet.ready_at as string | null) ?? null,
      filledBy: (sheet.filled_by as string | null) ?? null,
      machines: ((sheet.machine_ids ?? []) as string[])
        .filter((id) => name.has(id))
        .map((id) => ({
          id,
          name: name.get(id)!,
          done: Boolean(stops[id]?.completedAt),
          doneAt: stops[id]?.completedAt ?? null,
          skipped: stops[id]?.skipped === true,
        })),
    };
  });
}

/** Finished step-by-step rounds of this organisation, as far as their clocks go. */
async function timedRounds(orgId: string) {
  const { data } = await createAdminClient()
    .from("refill_sheets")
    .select("filled_by, ready_at, completed_at, stops")
    .eq("org_id", orgId)
    .eq("flow_version", 2)
    .not("ready_at", "is", null)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(500);
  return roundTimings(
    (data ?? []).map((row) => ({
      filledBy: (row.filled_by as string | null) ?? null,
      readyAt: row.ready_at as string,
      completedAt: row.completed_at as string,
      stops: (row.stops ?? {}) as Record<string, StopRecord>,
    })),
  );
}

export type RouteTimes = { machines: Record<string, Average>; legs: Record<string, Average> };

/**
 * How long a machine and each drive usually take, for the plan on a round:
 * the operator or a filler. No names: who was quick is the operator's to see.
 */
export async function getRouteTimes(orgId: string): Promise<RouteTimes> {
  if ((await requireRefillAccess()) !== orgId) throw new Error("Not found");
  const { machines, legs } = await timedRounds(orgId);
  return { machines, legs };
}

export type FillerOverview = RoundTimings & {
  machineNames: Record<string, string>;
  /** The team's fillers, also before their first round, under the name a round gets. */
  team: { name: string; email: string | null }[];
  /** The person looking, under that same name, to mark them. */
  me: string | null;
};

/**
 * Who fills and how long it takes, for the operator only: per filler, per
 * machine and per drive, from finished step-by-step rounds.
 */
export async function getFillerOverview(orgId: string): Promise<FillerOverview> {
  await requireOperator();
  if ((await getScope()).orgId !== orgId) throw new Error("Not found");
  const admin = createAdminClient();
  const [timings, { data: machines }, { data: fillers }, me] = await Promise.all([
    timedRounds(orgId),
    admin.from("machines").select("id, name").eq("org_id", orgId),
    admin.from("memberships").select("user_id").eq("org_id", orgId).eq("role", "filler"),
    createClient().then((client) => client.auth.getUser()),
  ]);
  const team = await Promise.all(
    (fillers ?? []).map(async (row) => {
      const { data } = await admin.auth.admin.getUserById(row.user_id as string);
      return { name: displayName(data.user) ?? "—", email: data.user?.email ?? null };
    }),
  );
  return {
    ...timings,
    machineNames: Object.fromEntries((machines ?? []).map((row) => [row.id as string, row.name as string])),
    team,
    me: displayName(me.data.user),
  };
}

export type TeamMember = { userId: string; email: string | null; role: Role; businessName: string | null };
export type TeamInvite = { email: string; role: Role; invitedAt: string; token: string | null };

/**
 * Everyone who can open this organisation, and who is still invited. The
 * operator's to see: a filler or a shop never learns who else is in.
 */
export async function getTeam(orgId: string): Promise<{ members: TeamMember[]; invites: TeamInvite[] }> {
  await requireOperator();
  const admin = createAdminClient();
  const [{ data: rows }, { data: invites }] = await Promise.all([
    admin.from("memberships").select("user_id, role, businesses(name)").eq("org_id", orgId),
    admin
      .from("allowed_emails")
      .select("email, role, invited_at, token")
      .eq("org_id", orgId)
      .is("claimed_at", null)
      .order("invited_at", { ascending: true }),
  ]);
  const members = await Promise.all(
    (rows ?? []).map(async (row) => {
      const { data } = await admin.auth.admin.getUserById(row.user_id as string);
      const business = row.businesses as { name: string } | { name: string }[] | null;
      return {
        userId: row.user_id as string,
        email: data.user?.email ?? null,
        role: row.role as Role,
        businessName: (Array.isArray(business) ? business[0]?.name : business?.name) ?? null,
      };
    }),
  );
  const order: Record<Role, number> = { owner: 0, admin: 1, filler: 2, member: 3 };
  members.sort((a, b) => order[a.role] - order[b.role] || (a.email ?? "").localeCompare(b.email ?? ""));
  return {
    members,
    invites: (invites ?? []).map((row) => ({
      email: row.email as string,
      role: row.role as Role,
      invitedAt: row.invited_at as string,
      token: (row.token as string | null) ?? null,
    })),
  };
}

export type MonthTotals = {
  /** "2026-09" */
  month: string;
  /** Days the month counts: all of them once it is over, up to today while it runs. */
  days: number;
  complete: boolean;
  revenue: number;
  units: number;
};

const lastDayOf = (month: string) =>
  `${month}-${String(new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate()).padStart(2, "0")}`;

/**
 * One calendar year month by month, plus the December before it so January
 * has something to be compared with. Every month is an ordinary stats report,
 * so scoping, start dates and the € 0 rule are exactly those of every other
 * figure: nothing here counts sales on its own.
 */
export async function getMonthlyReport(
  orgId: string,
  filters: Pick<StatsFilters, "machines" | "businesses" | "products">,
  year: number,
): Promise<{ months: MonthTotals[]; firstSale: string | null }> {
  const today = reportDay(new Date(), DISPLAY_TIME_ZONE);
  const thisMonth = today.slice(0, 7);
  const months: string[] = [];
  for (let i = 0; i <= 12; i++) {
    const month = new Date(Date.UTC(year - 1, 11 + i, 1)).toISOString().slice(0, 7);
    if (month > thisMonth) break;
    months.push(month);
  }

  const reports = await Promise.all(
    months.map((month) =>
      getStatsReport(orgId, {
        machines: filters.machines,
        businesses: filters.businesses,
        products: filters.products,
        period: "custom",
        from: `${month}-01`,
        to: month < thisMonth ? lastDayOf(month) : today,
      }),
    ),
  );

  return {
    months: months.map((month, i) => {
      const complete = month < thisMonth;
      return {
        month,
        days: Number((complete ? lastDayOf(month) : today).slice(8, 10)),
        complete,
        revenue: Number(reports[i].totals.revenue),
        units: Number(reports[i].totals.units),
      };
    }),
    firstSale: reports[0]?.first_sale ?? null,
  };
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
  const { businessId, role } = await getScope();
  const { data, error } = await createAdminClient().rpc("machine_stock", {
    target_org: orgId,
    machine_filter: machineIds?.length ? machineIds : null,
  });
  if (error) throw new Error(error.message);
  const slots = (data ?? []) as SlotStock[];
  // A filler fills slots; what a piece sells for is not theirs to see.
  if (!businessId) return role === "filler" ? slots.map((slot) => ({ ...slot, price: null })) : slots;

  // On a fridge two shops share, the co-tenant's slots stay on the drawing —
  // taking them out would leave holes and make the machine unreadable — but
  // what is in them, what it costs and how much is left is not yours to see.
  const mine = new Set((await getMachines(orgId)).map((m) => m.id));
  return slots
    .filter((slot) => mine.has(slot.machine_id))
    .map((slot) =>
      slot.business_id === businessId
        ? slot
        : {
            ...slot,
            product_id: null,
            product_name: null,
            photo_path: null,
            price: null,
            stock: null,
            level_after: null,
            counted_at: null,
            sales_since: 0,
          },
    );
}

/** Per machine: payments that went through and those that did not, since a date. */
export async function getPaymentHealth(orgId: string, since: Date): Promise<Map<string, PaymentHealth>> {
  await denyFillerAccess();
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
/** The last few payments of a machine, for its page. */
export async function getPaymentFeed(orgId: string, machineId: string, limit = 12): Promise<PaymentEntry[]> {
  return (await getPayments(orgId, machineId, { limit })).rows;
}

/**
 * A machine's payments, newest first, a page at a time: approved, declined and
 * broken off alike, each at what the customer tried to pay. A shop on a shared
 * fridge sees the sales of its own slots only, by the same rule as every
 * figure (sale_business): what a slot of the co-tenant sold is not hers.
 */
export async function getPayments(
  orgId: string,
  machineId: string,
  { limit = 50, offset = 0 }: { limit?: number; offset?: number } = {},
): Promise<{ rows: PaymentEntry[]; more: boolean }> {
  await requireMachineAccess(orgId, machineId);
  const { businessId } = await getScope();
  const admin = createAdminClient();
  const [{ data: machine }, { data: assignments }, { data: slots }] = await Promise.all([
    admin.from("machines").select("business_id, shared_business_id").eq("id", machineId).eq("org_id", orgId).maybeSingle(),
    admin
      .from("selection_assignments")
      .select("selection_number, valid_from, valid_to, products(name)")
      .eq("org_id", orgId)
      .eq("machine_id", machineId),
    admin.from("slots").select("selection_number, business_id").eq("org_id", orgId).eq("machine_id", machineId),
  ]);

  let query = admin
    .from("transactions")
    .select("occurred_at, amount, disposition, item_ref, requested:raw_json->>requestedAmount, ref:raw_json->>itemRef")
    .eq("org_id", orgId)
    .eq("machine_id", machineId)
    .not("disposition", "is", null);
  if (businessId && machine?.shared_business_id) {
    const owners = [machine.business_id, machine.shared_business_id];
    const own = (slots ?? [])
      .filter((slot) =>
        owners.includes(slot.business_id) ? slot.business_id === businessId : machine.business_id === businessId,
      )
      .map((slot) => slot.selection_number as string);
    query = query.in("item_ref", own.length ? own : [NOTHING]);
  }
  const { data, error } = await query.order("occurred_at", { ascending: false }).range(offset, offset + limit);
  if (error) throw new Error(error.message);

  const named = (assignments ?? []).map((a) => ({
    selection: a.selection_number as string,
    from: a.valid_from as string,
    to: (a.valid_to as string | null) ?? null,
    name: ((Array.isArray(a.products) ? a.products[0] : a.products) as { name: string } | null)?.name ?? null,
  }));
  const rows = (data ?? []).slice(0, limit).map((t) => {
    const selection = (t.item_ref as string | null) ?? (t.ref as string | null) ?? null;
    const at = t.occurred_at as string;
    const product = named.find((a) => a.selection === selection && a.from <= at && (a.to === null || at < a.to));
    const amount = Number(t.amount);
    const requested = typeof t.requested === "string" && /^[0-9]+$/.test(t.requested) ? Number(t.requested) / 100 : null;
    return {
      occurred_at: at,
      // What the customer tried to pay: a refused payment commits nothing.
      amount: amount > 0 ? amount : (requested ?? amount),
      disposition: t.disposition as string,
      product_name: product?.name ?? null,
      selection_number: selection,
    };
  });
  return { rows, more: (data ?? []).length > limit };
}

export async function getMachineSalesSplit(
  orgId: string,
  machineId: string,
  since: Date,
): Promise<MachineSalesSplit[]> {
  await denyFillerAccess();
  const { businessId } = await getScope();
  const { data, error } = await createAdminClient().rpc("machine_sales_split", {
    target_org: orgId,
    target_machine: machineId,
    since: since.toISOString(),
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as MachineSalesSplit[])
    .filter((r) => !businessId || r.business_id === businessId)
    .map((r) => ({
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
  await denyFillerAccess();
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
  await denyFillerAccess();
  const { data, error } = await createAdminClient()
    .from("shelf_life_presets")
    .select("id, name, days")
    .eq("org_id", orgId)
    .order("days");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getProductSlotCounts(orgId: string): Promise<Map<string, number>> {
  await denyFillerAccess();
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
  await denyFillerAccess();
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
  await denyFillerAccess();
  const { data, error } = await createAdminClient().rpc("business_recent_sales", {
    target_org: orgId,
    target_business: businessId,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as RecentSale[]).map((s) => ({ ...s, amount: Number(s.amount) }));
}

export async function getBusinesses(orgId: string): Promise<Business[]> {
  await denyFillerAccess();
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
/** One slot's shelf life: the first date something in it runs out, and what already has. */
export type SlotShelfLife = { nextExpiresAt: string | null; expired: number };

/**
 * Per slot of one machine, when the oldest piece in it runs out (from the
 * batches each refill starts) and how many are past their date. A shop on a
 * shared fridge gets its own slots only, like the stock itself.
 */
export async function getSlotShelfLife(orgId: string, machineId: string): Promise<Map<string, SlotShelfLife>> {
  await requireMachineAccess(orgId, machineId);
  const { businessId } = await getScope();
  const { data, error } = await createAdminClient().rpc("slot_freshness", {
    target_org: orgId,
    machine_filter: [machineId],
  });
  if (error) throw new Error(error.message);
  const slots = new Map<string, SlotShelfLife>();
  // One row per batch; the per-slot figures repeat on each, so the first one says it.
  for (const row of (data ?? []) as {
    selection_number: string;
    business_id: string | null;
    next_expires_at: string | null;
    qty_expired: number;
  }[]) {
    if (businessId && row.business_id !== businessId) continue;
    if (slots.has(row.selection_number)) continue;
    slots.set(row.selection_number, { nextExpiresAt: row.next_expires_at, expired: Number(row.qty_expired) });
  }
  return slots;
}

export async function getExpiryAlerts(orgId: string): Promise<ExpiryAlert[]> {
  await denyFillerAccess();
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
  await denyFillerAccess();
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
  await denyFillerAccess();
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
  await denyFillerAccess();
  const [mine, shared] = await Promise.all([ownMachineIds(orgId), sharedSelections(orgId)]);
  const { data, error } = await createAdminClient().rpc("unassigned_sales", { target_org: orgId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as UnassignedGroup[])
    .filter((g) => !mine || mine.includes(g.machine_id))
    // On a shared machine a shop sees its own slots' sales, never its neighbour's.
    .filter((g) => !shared?.has(g.machine_id) || shared.get(g.machine_id)!.has(g.selection_number))
    .map((g) => ({
    ...g,
    sales: Number(g.sales),
    revenue: Number(g.revenue),
    typical_price: g.typical_price === null ? null : Number(g.typical_price),
  }));
}

export async function getCurrentAssignments(orgId: string, machineId: string): Promise<Map<string, string>> {
  await requireMachineAccess(orgId, machineId);
  const [{ data }, shared] = await Promise.all([
    createAdminClient()
      .from("selection_assignments")
      .select("selection_number, product_id")
      .eq("org_id", orgId)
      .eq("machine_id", machineId)
      .is("valid_to", null),
    sharedSelections(orgId),
  ]);
  // On a shared machine a shop sees what is in its own slots, never its neighbour's.
  const own = shared?.get(machineId);
  return new Map(
    (data ?? []).filter((a) => !own || own.has(a.selection_number)).map((a) => [a.selection_number, a.product_id]),
  );
}

export async function getRefillHistory(orgId: string, machineId: string): Promise<RefillEvent[]> {
  await requireMachineAccess(orgId, machineId);
  const { businessId } = await getScope();
  const admin = createAdminClient();
  const { data } = await admin
    .from("stock_events")
    .select("occurred_at, type, delta, refill_sheet_id, filled_by, selection_number")
    .eq("org_id", orgId)
    .eq("machine_id", machineId)
    .order("occurred_at", { ascending: false })
    .limit(500);

  // A shop on a shared fridge counts its own slots only, and does not get the
  // e-mail address of whoever filled: that is the operator's staff, not theirs.
  let rows = data ?? [];
  if (businessId) {
    const { data: slots } = await admin.rpc("machine_stock", { target_org: orgId, machine_filter: [machineId] });
    const own = new Set(
      ((slots ?? []) as SlotStock[]).filter((slot) => slot.business_id === businessId).map((slot) => slot.selection_number),
    );
    rows = rows.filter((row) => own.has(row.selection_number as string)).map((row) => ({ ...row, filled_by: null }));
  }

  // One refill or correction writes a row per slot with the same timestamp.
  const events = new Map<string, RefillEvent>();
  for (const row of rows) {
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
  await denyFillerAccess();
  const { data } = await createAdminClient()
    .from("layout_templates")
    .select("id, org_id, name, machine_type, layout")
    .or(`org_id.is.null,org_id.eq.${orgId}`)
    .order("created_at");
  return (data ?? []) as LayoutTemplate[];
}

export async function getRefillSheets(orgId: string): Promise<RefillSheet[]> {
  await denyFillerAccess();
  const mine = await ownMachineIds(orgId);
  const { data } = await createAdminClient()
    .from("refill_sheets")
    .select("id, share_token, machine_ids, notes, lines, created_at, started_at, completed_at, filled_by, km, box, flow_version, stops, returns")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(mine ? 60 : 10);
  const sheets = (data ?? []) as RefillSheet[];
  // A run belongs to whoever owns the machines it visited.
  if (!mine) return sheets;
  const { businessId } = await getScope();
  const view = await shopView(orgId, businessId!, mine);
  return sheets
    .filter((sheet) => sheet.machine_ids.some((id) => mine.includes(id)))
    .map((sheet) => onlyMine(sheet, view))
    .slice(0, 10);
}

export async function getRefillSheet(orgId: string, id: string): Promise<RefillSheet | null> {
  await denyFillerAccess();
  const mine = await ownMachineIds(orgId);
  const { data } = await createAdminClient()
    .from("refill_sheets")
    .select("id, share_token, machine_ids, notes, lines, created_at, started_at, completed_at, filled_by, km, box, flow_version, stops, returns")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  const sheet = (data as RefillSheet) ?? null;
  // Guessing a sheet id must not print another customer's run.
  if (!sheet || !mine) return sheet;
  if (!sheet.machine_ids.some((machineId) => mine.includes(machineId))) return null;
  const { businessId } = await getScope();
  return onlyMine(sheet, await shopView(orgId, businessId!, mine));
}

// Public: the share link carries the unguessable token instead of a login.
export async function getRefillSheetByToken(token: string): Promise<RefillSheet | null> {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return null;
  const { data } = await createAdminClient()
    .from("refill_sheets")
    .select("id, share_token, machine_ids, notes, lines, created_at, started_at, completed_at, filled_by, km, box, flow_version, stops, returns")
    .eq("share_token", token)
    // A step-by-step round (flow 2) is filled in Vendly itself, never through a link.
    .eq("flow_version", 1)
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
  await denyFillerAccess();
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
  await denyFillerAccess();
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
  await denyFillerAccess();
  const { businessId } = await getScope();
  const { data, error } = await createAdminClient().rpc("run_summary", {
    target_org: orgId,
    sheet: sheetId,
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as RunSummaryRow[];
  if (!businessId) return rows;
  // A shop on a shared run reads its own products only, not the co-tenant's.
  const { data: own } = await createAdminClient()
    .from("products")
    .select("id")
    .eq("org_id", orgId)
    .eq("business_id", businessId);
  const mine = new Set((own ?? []).map((row) => row.id as string));
  return rows.filter((row) => mine.has(row.product_id));
}

/**
 * Slots where what people pay does not match the product hanging on them. Two
 * different illnesses with one symptom: one steady other price means the price
 * here is simply out of date, while a wide spread means several products go
 * through that one number and the per-product figures cannot be trusted.
 */
export async function getPriceMismatches(orgId: string, daysBack = 90): Promise<PriceMismatch[]> {
  await denyFillerAccess();
  const { businessId } = await getScope();
  const { data, error } = await createAdminClient().rpc("price_mismatch", {
    target_org: orgId,
    days_back: daysBack,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as PriceMismatch[])
    .filter((row) => !businessId || row.business_id === businessId)
    .map((row) => ({
      ...row,
      list_price: Number(row.list_price),
      sales: Number(row.sales),
      off_price: Number(row.off_price),
      distinct_prices: Number(row.distinct_prices),
      spread: Number(row.spread),
      usual_price: Number(row.usual_price),
    }));
}

/** What a new operator still has to do before the app can tell them anything. */
export type SetupState = {
  payterConnected: boolean;
  machines: number;
  namedMachines: number;
  withLayout: number;
  products: number;
  linkedSelections: number;
  done: boolean;
};

/**
 * The state of a fresh installation. Everything here answers one question for
 * someone who just bought the app: what do I do next?
 */
export async function getSetupState(orgId: string): Promise<SetupState> {
  await denyFillerAccess();
  const admin = createAdminClient();
  const [credentials, org, machines, slots, products, assignments] = await Promise.all([
    admin.from("payter_credentials").select("org_id").eq("org_id", orgId).maybeSingle(),
    admin.from("organizations").select("is_demo").eq("id", orgId).maybeSingle(),
    admin.from("machines").select("id, name, payter_serial_number").eq("org_id", orgId).eq("excluded", false),
    admin.from("slots").select("machine_id").eq("org_id", orgId),
    admin.from("products").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("archived", false),
    admin.from("selection_assignments").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("valid_to", null),
  ]);

  const all = machines.data ?? [];
  // A machine keeps its serial as a name until somebody gives it a real one.
  const named = all.filter((m) => m.name && m.name !== m.payter_serial_number).length;
  const withLayout = new Set((slots.data ?? []).map((s) => s.machine_id)).size;

  const state = {
    // A demo has invented sales and no Payter login, and is set up all the same.
    payterConnected: Boolean(credentials.data) || Boolean(org.data?.is_demo),
    machines: all.length,
    namedMachines: named,
    withLayout,
    products: products.count ?? 0,
    linkedSelections: assignments.count ?? 0,
  };
  return {
    ...state,
    done:
      state.payterConnected &&
      state.machines > 0 &&
      state.namedMachines === state.machines &&
      state.withLayout === state.machines &&
      state.products > 0 &&
      state.linkedSelections > 0,
  };
}

/** Refuses unless the caller's scope contains this machine. */
export async function requireMachineAccess(orgId: string, machineId: string): Promise<void> {
  await denyFillerAccess();
  if (!(await getMachine(orgId, machineId))) throw new Error("Not found");
}

/**
 * The selections a shop owns on each shared machine it is in. On a shared
 * machine a slot belongs to the business it names, or else to the machine's
 * first business (as sale_business decides); a selection without a slot
 * belongs to neither shop. Null for the operator, who owns every slot.
 */
async function sharedSelections(orgId: string): Promise<Map<string, Set<string>> | null> {
  const { businessId } = await getScope();
  if (!businessId) return null;
  const admin = createAdminClient();
  const { data: machines } = await admin
    .from("machines")
    .select("id, business_id, shared_business_id")
    .eq("org_id", orgId)
    .not("shared_business_id", "is", null);
  const shared = (machines ?? []).filter((m) => m.business_id === businessId || m.shared_business_id === businessId);
  const owned = new Map<string, Set<string>>(shared.map((m) => [m.id as string, new Set<string>()]));
  if (shared.length === 0) return owned;
  const { data: slots } = await admin
    .from("slots")
    .select("machine_id, selection_number, business_id")
    .eq("org_id", orgId)
    .in("machine_id", shared.map((m) => m.id as string));
  for (const slot of slots ?? []) {
    const machine = shared.find((m) => m.id === slot.machine_id);
    if (!machine) continue;
    const owner = [machine.business_id, machine.shared_business_id].includes(slot.business_id)
      ? slot.business_id
      : machine.business_id;
    if (owner === businessId) owned.get(machine.id as string)!.add(slot.selection_number as string);
  }
  return owned;
}

/**
 * Refuses unless the caller may change these slots: the machine must be
 * theirs, and on a shared machine a shop owns only its own slots. One
 * selection or many; a list that names a single neighbour's slot is refused
 * whole.
 */
export async function requireSelectionAccess(
  orgId: string,
  machineId: string,
  selections: string | string[],
): Promise<void> {
  await requireMachineAccess(orgId, machineId);
  const own = (await sharedSelections(orgId))?.get(machineId);
  if (own && [selections].flat().some((selection) => !own.has(selection))) throw new Error("Not found");
}

/**
 * Whether the caller may save this machine's layout. A save rewrites every
 * slot and who rents it, so on a shared machine that is the operator's call,
 * like who the machine belongs to; a shop there changes the products in its
 * own slots instead, one at a time (requireSelectionAccess).
 */
export async function canEditLayout(machine: Pick<Machine, "shared_business_id">): Promise<boolean> {
  if (await isFiller()) return false;
  return !machine.shared_business_id || (await isOperator());
}

/** Refuses unless the caller may save this machine's layout (see canEditLayout). */
export async function requireLayoutAccess(orgId: string, machineId: string): Promise<void> {
  const machine = await getMachine(orgId, machineId);
  if (!machine || !(await canEditLayout(machine))) throw new Error("Not found");
}

/** Refuses unless the caller's scope contains this product. */
export async function requireProductAccess(orgId: string, productId: string): Promise<void> {
  await denyFillerAccess();
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
