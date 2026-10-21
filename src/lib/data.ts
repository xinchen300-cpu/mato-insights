import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { denyFillerAccess, getScope, getSessionUser, isFiller, isOperator, requireOperator, requireRefillAccess, type Role, isBlockedOrg } from "@/lib/org";
import { displayName } from "@/lib/people";
import { cleanRoundSettings, type RoundSettings } from "@/lib/round-settings";
import { lineTake, onlyMine, roundOrder, roundTimings, slotKey, stopChanges, type Average, type FlowLine, type RoundTimings, type ShopView, type StopRecord } from "@/lib/refill-flow";
import type { MyRound } from "@/lib/filler-stats";
import { terminalStatus, type TerminalStatus } from "@/lib/terminal-status";
import { DISPLAY_TIME_ZONE } from "@/i18n/format";
import { reportDay } from "@/lib/stats";
import { productionPlan, RATE_DAYS, type ProductionLine } from "@/lib/production";
import { camerasEnabled } from "@/lib/unifi";
import type { LinkedCamera } from "@/lib/camera-link";
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
  MachineType,
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

export type RoundMachine = {
  id: string;
  name: string;
  status: TerminalStatus;
  lastSale: string | null;
  /** The tile photo, so the filler recognises the machine at a glance. */
  photoPath: string | null;
  /** A snack machine gets no question about dishes past their date. */
  type: MachineType | null;
  /** Where it stands, for "Navigeer". */
  address: string | null;
};
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
  /** "Ronde 12": its number within the organisation. */
  number: number;
  flowVersion: number;
  createdAt: string;
  startedAt: string | null;
  readyAt: string | null;
  completedAt: string | null;
  /** The machines to visit, in the order of the round. */
  machines: RoundMachine[];
  /**
   * Every machine chosen for the round, in its order: the ones to visit, and
   * one that stood full when it was made, shown with a word and passed by.
   */
  route: RoundMachine[];
  lines: FlowLine[];
  slots: RoundSlot[];
  picked: Record<string, number>;
  stops: Record<string, StopRecord>;
  /**
   * What the finished machines changed per slot (slotKey → pieces): stock now
   * less this is how it stood before, for "Terugzetten naar …%" (20-10-2026).
   */
  changed: Record<string, number>;
  /** How the operator wants the round to go (Werkwijze). */
  settings: RoundSettings;
  /** What the operator wrote for this one round, for whoever fills it. */
  notes: string | null;
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
    .select("id, number, flow_version, created_at, started_at, ready_at, completed_at, machine_ids, chosen_machine_ids, lines, box, stops, notes")
    .eq("id", sheetId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!sheet) return null;

  const machineIds = (sheet.machine_ids ?? []) as string[];
  // The full ones too: their place on the route and how full they are now.
  const order = roundOrder((sheet.chosen_machine_ids ?? []) as string[], machineIds);
  const [{ data: machineRows }, stock, lastSales, { data: org }, { data: events }] = await Promise.all([
    admin
      .from("machines")
      .select("id, name, photo_path, last_connected_at, last_disconnected_at, type, address")
      .eq("org_id", orgId)
      .in("id", order.length ? order : [NOTHING]),
    // With what this round already put in: what a finished stop changed, and Terugzetten, are measured on it.
    getMachineStock(orgId, order.length ? order : [NOTHING], { withOpenRounds: true }),
    getLastSales(orgId),
    admin.from("organizations").select("refill_settings").eq("id", orgId).maybeSingle(),
    // Only an open round can still be put back.
    sheet.completed_at
      ? Promise.resolve({ data: [] })
      : admin
          .from("stock_events")
          .select("machine_id, selection_number, delta, note, occurred_at")
          .eq("org_id", orgId)
          .eq("refill_sheet_id", sheetId)
          .limit(2000),
  ]);
  const byId = new Map((machineRows ?? []).map((row) => [row.id as string, row]));
  const live = new Map(stock.map((slot) => [slotKey(slot.machine_id, slot.selection_number), slot]));
  const roundMachine = (id: string): RoundMachine => {
    const row = byId.get(id)!;
    return {
      id,
      name: row.name as string,
      status: terminalStatus(row.last_connected_at as string | null, row.last_disconnected_at as string | null),
      lastSale: lastSales.get(id) ?? null,
      photoPath: (row.photo_path as string | null) ?? null,
      type: (row.type as MachineType | null) ?? null,
      address: (row.address as string | null) ?? null,
    };
  };

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
        take: lineTake(line),
        expired: line.qty_expired ?? 0,
      };
    });

  return {
    id: sheet.id as string,
    number: Number(sheet.number),
    flowVersion: Number(sheet.flow_version ?? 1),
    createdAt: sheet.created_at as string,
    startedAt: (sheet.started_at as string | null) ?? null,
    readyAt: (sheet.ready_at as string | null) ?? null,
    completedAt: (sheet.completed_at as string | null) ?? null,
    machines: machineIds.filter((id) => byId.has(id)).map(roundMachine),
    route: order.filter((id) => byId.has(id)).map(roundMachine),
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
    changed: stopChanges(
      (events ?? []).map((event) => ({
        machine_id: event.machine_id as string,
        selection_number: event.selection_number as string,
        delta: Number(event.delta ?? 0),
        note: (event.note as string | null) ?? null,
        occurred_at: event.occurred_at as string,
      })),
    ),
    settings: cleanRoundSettings(org?.refill_settings),
    notes: (sheet.notes as string | null)?.trim() || null,
  };
}

/**
 * What a round made now would carry, slot by slot: what each slot lacks. A
 * new round and the vullijst read this one plan, so they never disagree.
 */
export async function getRefillPlan(orgId: string, machineIds: string[]): Promise<RefillLine[]> {
  if ((await requireRefillAccess()) !== orgId) throw new Error("Not found");
  // No machines asked for is nothing to plan, never every machine.
  if (machineIds.length === 0) return [];
  // As every screen counts it: a machine filled on a round still open is not filled yet (21-10-2026).
  const { data, error } = await createAdminClient().rpc("refill_plan_settled", { target_org: orgId, machine_filter: machineIds });
  if (error) throw new Error(error.message);
  return (data ?? []) as RefillLine[];
}

/** How this organisation wants its rounds to go, for whoever runs them: the operator or a filler. */
export async function getRoundSettings(orgId: string): Promise<RoundSettings> {
  if ((await requireRefillAccess()) !== orgId) throw new Error("Not found");
  const { data } = await createAdminClient()
    .from("organizations")
    .select("refill_settings")
    .eq("id", orgId)
    .maybeSingle();
  return cleanRoundSettings(data?.refill_settings);
}

export type OpenRound = {
  id: string;
  createdAt: string;
  readyAt: string | null;
  /** Who started it ("Start ronde"), as they gave their name. */
  filledBy: string | null;
  /** Made, or started, by whoever is looking: theirs to carry on with. */
  mine: boolean;
  machines: { id: string; name: string; done: boolean; doneAt: string | null; skipped: boolean }[];
};

/**
 * Step-by-step rounds that are not finished yet, for whoever fills them: the
 * operator or a filler. Names and progress only.
 */
export async function getOpenRounds(orgId: string): Promise<OpenRound[]> {
  if ((await requireRefillAccess()) !== orgId) throw new Error("Not found");
  const admin = createAdminClient();
  // The names come alongside the rounds, not after them: every machine of the
  // organisation, of which only the rounds' own are used.
  const [{ data: sheets }, { data: machines }, me] = await Promise.all([
    admin
      .from("refill_sheets")
      .select("id, created_at, ready_at, machine_ids, stops, filled_by, created_by")
      .eq("org_id", orgId)
      .eq("flow_version", 2)
      .is("completed_at", null)
      .order("created_at", { ascending: false })
      .limit(20),
    admin.from("machines").select("id, name").eq("org_id", orgId),
    getSessionUser(),
  ]);
  const name = new Map((machines ?? []).map((row) => [row.id as string, row.name as string]));
  const myName = displayName(me);
  return (sheets ?? []).map((sheet) => {
    const stops = (sheet.stops ?? {}) as Record<string, StopRecord>;
    const createdBy = (sheet.created_by as string | null) ?? null;
    return {
      id: sheet.id as string,
      createdAt: sheet.created_at as string,
      readyAt: (sheet.ready_at as string | null) ?? null,
      filledBy: (sheet.filled_by as string | null) ?? null,
      // Made by this person; a round from before 20-10-2026 knows only who started it.
      mine: me !== null && (createdBy === me.id || (createdBy === null && myName !== null && sheet.filled_by === myName)),
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

type FillerRoundRow = {
  id: string;
  ready_at: string;
  completed_at: string;
  machine_ids: string[] | null;
  visited: number;
  skipped: number;
  items: number;
};

/**
 * The finished step-by-step rounds of the person looking, for their own
 * figures: the operator or a filler, in their own organisation. Machines,
 * pieces and clocks only, no money, and nobody else's rounds. A round knows
 * its filler by the name it got at "Start ronde" (see people.ts), so this
 * matches on that same name, trimmed and in any case. The database sums each
 * round up (filler_rounds), so its stops never leave it.
 */
export async function getMyRounds(orgId: string): Promise<MyRound[]> {
  if ((await requireRefillAccess()) !== orgId) throw new Error("Not found");
  const me = displayName(await getSessionUser());
  if (!me) return [];
  const { data, error } = await createAdminClient().rpc("filler_rounds", { target_org: orgId, filler_name: me });
  // The figures come second to the work: a failing query must not keep a
  // filler from their home or from closing a round. It does go to the logs.
  if (error) console.error("[filler_rounds]", error.message);
  return ((data ?? []) as FillerRoundRow[]).map((row) => ({
    id: row.id,
    readyAt: row.ready_at,
    completedAt: row.completed_at,
    machineIds: row.machine_ids ?? [],
    visited: Number(row.visited),
    skipped: Number(row.skipped),
    items: Number(row.items),
  }));
}

export type FillerOverview = RoundTimings & {
  machineNames: Record<string, string>;
  /** The team's fillers, also before their first round, under the name a round gets. */
  team: { name: string; email: string | null }[];
  /**
   * Everyone who runs or fills rounds here (owner, manager, filler), under that
   * same name, with the account to put a photo on and the photo, if any.
   */
  staff: { userId: string; name: string; photoPath: string | null }[];
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
  const [timings, { data: machines }, { data: members }, me] = await Promise.all([
    timedRounds(orgId),
    admin.from("machines").select("id, name").eq("org_id", orgId),
    // The organisation's own people, never a shop's account.
    admin.from("memberships").select("user_id, role").eq("org_id", orgId).is("business_id", null),
    getSessionUser(),
  ]);
  const people = await Promise.all(
    (members ?? []).map(async (row) => {
      const { data } = await admin.auth.admin.getUserById(row.user_id as string);
      // The photo sits in app_metadata: only the server writes there, never the person.
      const photo = data.user?.app_metadata?.photo_path;
      return {
        userId: row.user_id as string,
        role: row.role as Role,
        name: displayName(data.user) ?? "—",
        email: data.user?.email ?? null,
        photoPath: typeof photo === "string" ? photo : null,
      };
    }),
  );
  return {
    ...timings,
    machineNames: Object.fromEntries((machines ?? []).map((row) => [row.id as string, row.name as string])),
    team: people.filter((person) => person.role === "filler").map(({ name, email }) => ({ name, email })),
    staff: people.map(({ userId, name, photoPath }) => ({ userId, name, photoPath })),
    me: displayName(me),
  };
}

/**
 * An automatenshop rents machines or slots to businesses (zaken), each seeing
 * only its own sales; a zaak runs its own machines and never needs any of
 * that. Chosen in Settings. Anyone of the organisation may know which it is.
 */
export async function rentsToBusinesses(orgId: string): Promise<boolean> {
  if ((await getScope()).orgId !== orgId) throw new Error("Not found");
  const { data, error } = await createAdminClient()
    .from("organizations")
    .select("rents_to_businesses")
    .eq("id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data?.rents_to_businesses);
}

/** What an hour and a kilometre of refilling cost this operator, as set in Settings. */
export async function getRunRates(orgId: string): Promise<{ perHour: number; perKm: number }> {
  await requireOperator();
  if ((await getScope()).orgId !== orgId) throw new Error("Not found");
  const { data } = await createAdminClient()
    .from("organizations")
    .select("cost_per_hour, cost_per_km")
    .eq("id", orgId)
    .maybeSingle();
  return { perHour: Number(data?.cost_per_hour ?? 25), perKm: Number(data?.cost_per_km ?? 0.42) };
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
  "id, name, type, payter_serial_number, business_id, shared_business_id, data_since, km_round_trip, photo_path, last_connected_at, last_disconnected_at, terminal_model, terminal_network, terminal_flags, refill_manual, address, businesses!machines_business_id_fkey(name, logo_path)";

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
  photo_path: string | null;
  last_connected_at: string | null;
  last_disconnected_at: string | null;
  terminal_model: string | null;
  terminal_network: string | null;
  terminal_flags: string[] | null;
  refill_manual: boolean | null;
  address: string | null;
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
    photo_path: row.photo_path,
    last_connected_at: row.last_connected_at,
    last_disconnected_at: row.last_disconnected_at,
    terminal_model: row.terminal_model,
    terminal_network: row.terminal_network,
    terminal_flags: row.terminal_flags ?? [],
    refill_manual: row.refill_manual === true,
    address: row.address ?? null,
  };
}

/**
 * What is in each slot now. A machine filled on a round that is still open counts as it was before
 * that round (Xin, 21-10-2026: only when the whole route is done does a machine count as filled);
 * when the round completes, its fills count from the moment each machine was filled, minus what sold
 * since. Only the round itself asks `withOpenRounds`, to see what its own stops changed.
 */
export async function getMachineStock(
  orgId: string,
  machineIds?: string[],
  options?: { withOpenRounds?: boolean },
): Promise<SlotStock[]> {
  const { businessId, role } = await getScope();
  const { data, error } = await createAdminClient().rpc(options?.withOpenRounds ? "machine_stock" : "machine_stock_settled", {
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

/**
 * Per machine: payments that went through and those that did not, since a
 * date. A shop gets its own machines only, and on a shared one only what its
 * own slots took (sale_business): the machine-wide count would give away the
 * co-tenant's trade.
 */
export async function getPaymentHealth(orgId: string, since: Date): Promise<Map<string, PaymentHealth>> {
  await denyFillerAccess();
  const { data, error } = await createAdminClient().rpc("payment_health", {
    target_org: orgId,
    since: since.toISOString(),
  });
  if (error) throw new Error(error.message);
  const all = new Map(
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
  if (!(await getScope()).businessId) return all;
  const [machines, shared] = await Promise.all([getMachines(orgId), sharedSelections(orgId)]);
  const scoped = new Map<string, PaymentHealth>();
  await Promise.all(
    machines.map(async (machine) => {
      const own = shared?.get(machine.id);
      if (own) scoped.set(machine.id, await ownPaymentHealth(orgId, machine.id, own, since));
      else if (all.has(machine.id)) scoped.set(machine.id, all.get(machine.id)!);
    }),
  );
  return scoped;
}

/** payment_health for a shop's own slots of one shared machine, counted the same way. */
async function ownPaymentHealth(orgId: string, machineId: string, own: Set<string>, since: Date): Promise<PaymentHealth> {
  const admin = createAdminClient();
  const selections = own.size ? [...own] : [NOTHING];
  const { count: approved, error: countError } = await admin
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("machine_id", machineId)
    .gte("occurred_at", since.toISOString())
    .in("item_ref", selections)
    .eq("disposition", "APPROVED");
  if (countError) throw new Error(countError.message);
  // Every refused or broken-off attempt, a page at a time: the API stops at
  // a thousand rows, and a busy fridge must not lose the rest without a word.
  const problems: { occurred_at: string; amount: unknown; disposition: unknown; requested: unknown }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("transactions")
      .select("occurred_at, amount, disposition, requested:raw_json->>requestedAmount")
      .eq("org_id", orgId)
      .eq("machine_id", machineId)
      .gte("occurred_at", since.toISOString())
      .in("item_ref", selections)
      .not("disposition", "is", null)
      .neq("disposition", "APPROVED")
      .order("occurred_at", { ascending: false })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    problems.push(...((data ?? []) as typeof problems));
    if (!data || data.length < 1000) break;
  }
  // What the customer tried to pay, as attempted_amount() takes it: a refusal commits nothing.
  const tried = (t: { amount: unknown; requested: unknown }) =>
    Number(t.amount) > 0
      ? Number(t.amount)
      : typeof t.requested === "string" && /^[0-9]+$/.test(t.requested)
        ? Number(t.requested) / 100
        : Number(t.amount);
  const declined = problems.filter((t) => t.disposition === "DECLINED");
  const failed = problems.filter((t) => t.disposition !== "DECLINED");
  return {
    machine_id: machineId,
    approved: approved ?? 0,
    declined: declined.length,
    failed: failed.length,
    declined_amount: declined.reduce((sum, t) => sum + tried(t), 0),
    failed_amount: failed.reduce((sum, t) => sum + tried(t), 0),
    // Newest first, so the first row is the latest problem.
    last_problem_at: problems[0]?.occurred_at ?? null,
  };
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

  // Who owns which slot only matters to a shop: on a shared fridge she sees her
  // own slots' payments. Anyone else sees the machine whole, and waits for none of it.
  let own: string[] | null = null;
  if (businessId) {
    const [{ data: machine, error: machineError }, { data: slots, error: slotsError }] = await Promise.all([
      admin.from("machines").select("business_id, shared_business_id").eq("id", machineId).eq("org_id", orgId).maybeSingle(),
      admin.from("slots").select("selection_number, business_id").eq("org_id", orgId).eq("machine_id", machineId),
    ]);
    // Who owns which slot decides what a shop sees: an unread answer must not open the whole machine.
    if (machineError || slotsError) throw new Error((machineError ?? slotsError)!.message);
    if (machine?.shared_business_id) {
      const owners = [machine.business_id, machine.shared_business_id];
      own = (slots ?? [])
        .filter((slot) =>
          owners.includes(slot.business_id) ? slot.business_id === businessId : machine.business_id === businessId,
        )
        .map((slot) => slot.selection_number as string);
    }
  }

  let query = admin
    .from("transactions")
    .select("occurred_at, amount, disposition, item_ref, requested:raw_json->>requestedAmount, ref:raw_json->>itemRef")
    .eq("org_id", orgId)
    .eq("machine_id", machineId)
    .not("disposition", "is", null);
  if (own) query = query.in("item_ref", own.length ? own : [NOTHING]);
  // The payments and the names of what was in each slot, side by side.
  const [{ data: assignments }, { data, error }] = await Promise.all([
    admin
      .from("selection_assignments")
      .select("selection_number, valid_from, valid_to, products(name)")
      .eq("org_id", orgId)
      .eq("machine_id", machineId),
    query.order("occurred_at", { ascending: false }).range(offset, offset + limit),
  ]);
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
    // Approved at nothing: a card was tapped and no vend came. Not a sale, and
    // nobody paid, so it is listed with the refusals, never as "Betaald".
    const noSale = t.disposition === "APPROVED" && !(amount > 0);
    return {
      occurred_at: at,
      // What the customer tried to pay: a refused payment commits nothing.
      amount: amount > 0 ? amount : (requested ?? amount),
      disposition: noSale ? "NO_SALE" : (t.disposition as string),
      product_name: product?.name ?? null,
      selection_number: selection,
    };
  });
  return { rows, more: (data ?? []).length > limit };
}

export type LiveSale = {
  id: string;
  occurredAt: string;
  /** When Vendly took it in: a terminal that was offline can hand in a sale late. */
  createdAt: string;
  amount: number;
  machineId: string;
  machineName: string;
  productName: string | null;
  selection: string | null;
};

/**
 * The newest sales across the caller's machines, for the live strip on the
 * overview: approved and paid, since a €0 tap sold nothing. With `after`,
 * only what came in since (by arrival, so a late sale from an offline
 * terminal is not missed). A shop sees its own machines, and on a shared one
 * only its own slots; a filler sees no money at all.
 */
export async function getLiveSales(
  orgId: string,
  options: { after?: string | null; limit?: number } = {},
): Promise<LiveSale[]> {
  await denyFillerAccess();
  return liveSales(orgId, options);
}

/** A sale as a filler sees it: which product went out of which machine, and when. Never an amount. */
export type SoldItem = Omit<LiveSale, "amount">;

/**
 * What just sold, for a filler: the same feed as the overview's, with the
 * amount taken out here, on the server, so it never reaches the phone. Only
 * for whoever fills (the operator or a filler), never a shop.
 */
export async function getLiveSold(orgId: string, options: { after?: string | null; limit?: number } = {}): Promise<SoldItem[]> {
  if ((await requireRefillAccess()) !== orgId) throw new Error("Not found");
  return (await liveSales(orgId, options)).map((sale) => ({
    id: sale.id,
    occurredAt: sale.occurredAt,
    createdAt: sale.createdAt,
    machineId: sale.machineId,
    machineName: sale.machineName,
    productName: sale.productName,
    selection: sale.selection,
  }));
}

/** What sold in a stretch of days and when, as a filler sees it: pieces only, never an amount. */
export type SoldReport = {
  from: string;
  to: string;
  /** Machines that sold, most pieces first (Xin, 19-10-2026: machines instead of products). */
  machines: { machineId: string; name: string; units: number }[];
  hours: { hour: number; units: number }[];
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The best-selling machines and busiest hours for whoever fills (the operator
 * or a filler, never a shop), from the first to the last day asked: the
 * statistics' own report, with every amount taken out here, on the server, so
 * none reaches the phone.
 */
export async function getSoldReport(orgId: string, days: { from: string; to: string }): Promise<SoldReport> {
  if ((await requireRefillAccess()) !== orgId) throw new Error("Not found");
  if (!DAY.test(days.from) || !DAY.test(days.to) || days.to < days.from) throw new Error("invalid range");
  const { data, error } = await createAdminClient().rpc("stats_report", {
    target_org: orgId,
    period: "custom",
    custom_from: days.from,
    custom_to: days.to,
    machine_filter: null,
    business_filter: null,
    product_filter: null,
  });
  if (error) throw new Error(error.message);
  const report = data as StatsReport;
  return {
    from: report.cur_start,
    to: report.cur_end,
    machines: report.by_machine
      .filter((row) => row.units > 0)
      .sort((a, b) => b.units - a.units || a.machine_name.localeCompare(b.machine_name))
      .map((row) => ({ machineId: row.machine_id, name: row.machine_name, units: row.units })),
    hours: report.by_hour.map((row) => ({ hour: row.hour, units: row.units })),
  };
}

async function liveSales(
  orgId: string,
  { after = null, limit = 6 }: { after?: string | null; limit?: number } = {},
): Promise<LiveSale[]> {
  const scope = await getScope();
  if (scope.orgId !== orgId) throw new Error("Not found");
  const [machines, shared] = await Promise.all([getMachines(orgId), sharedSelections(orgId)]);
  if (machines.length === 0) return [];
  // On a shared machine a shop's own slots are picked in the query itself, so
  // a busy neighbour cannot crowd its sales out of the strip. A slot whose
  // number does not fit the filter syntax is left out, never let through.
  const ids = machines.map((machine) => machine.id);
  const whole = ids.filter((id) => !shared?.has(id));
  const parts = [
    ...(whole.length ? [`machine_id.in.(${whole.join(",")})`] : []),
    ...[...(shared ?? new Map<string, Set<string>>())].flatMap(([id, own]) => {
      const mine = [...own].filter((selection) => /^[\w.-]+$/.test(selection));
      return ids.includes(id) && mine.length > 0
        ? [`and(machine_id.eq.${id},item_ref.in.(${mine.map((selection) => `"${selection}"`).join(",")}))`]
        : [];
    }),
  ];
  if (parts.length === 0) return [];
  const admin = createAdminClient();
  let query = admin
    .from("transactions")
    .select("id, occurred_at, created_at, amount, machine_id, item_ref")
    .eq("org_id", orgId)
    .or(parts.join(","))
    .eq("disposition", "APPROVED")
    .gt("amount", 0)
    .order(after ? "created_at" : "occurred_at", { ascending: false })
    .limit(limit);
  if (after) query = query.gt("created_at", after);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? [])
    .filter((t) => !shared?.has(t.machine_id as string) || shared.get(t.machine_id as string)!.has(t.item_ref as string))
    .sort((a, b) => ((a.occurred_at as string) < (b.occurred_at as string) ? 1 : -1))
    .slice(0, limit);
  if (rows.length === 0) return [];

  const { data: assignments } = await admin
    .from("selection_assignments")
    .select("machine_id, selection_number, valid_from, valid_to, products(name)")
    .eq("org_id", orgId)
    .in("machine_id", [...new Set(rows.map((row) => row.machine_id as string))]);
  const names = new Map(machines.map((machine) => [machine.id, machine.name]));
  return rows.map((t) => {
    const at = t.occurred_at as string;
    const selection = (t.item_ref as string | null) ?? null;
    const product = (assignments ?? []).find(
      (a) =>
        a.machine_id === t.machine_id &&
        a.selection_number === selection &&
        (a.valid_from as string) <= at &&
        (a.valid_to === null || at < (a.valid_to as string)),
    );
    const named = product ? (Array.isArray(product.products) ? product.products[0] : product.products) : null;
    return {
      id: t.id as string,
      occurredAt: at,
      createdAt: t.created_at as string,
      amount: Number(t.amount),
      machineId: t.machine_id as string,
      machineName: names.get(t.machine_id as string) ?? "",
      productName: (named as { name: string } | null)?.name ?? null,
      selection,
    };
  });
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

/**
 * When each machine last sold something, paid. A shop gets its own machines
 * only, and on a shared one the last sale of its own slots: when the
 * co-tenant last sold is not its business.
 */
export type LastRefill = { at: string; by: string | null; pieces: number };

/**
 * When each machine was last filled, by whom, and how many pieces went in on
 * that visit (Xin, 19-10-2026), in a round or through Voorraad aanpassen
 * (21-10-2026). The operator's to see; anyone else gets none.
 */
export async function getLastRefills(orgId: string): Promise<Map<string, LastRefill>> {
  if (!(await isOperator()) || (await getScope()).orgId !== orgId) return new Map();
  // A round still open has not filled anything yet (21-10-2026).
  const { data, error } = await createAdminClient().rpc("last_refills_settled", { target_org: orgId });
  if (error) throw new Error(error.message);
  return new Map(
    ((data ?? []) as { machine_id: string; filled_at: string; filled_by: string | null; pieces: number }[]).map((row) => [
      row.machine_id,
      { at: row.filled_at, by: row.filled_by, pieces: Number(row.pieces) },
    ]),
  );
}

/** The organisation's own name, to leave off its machines' names; only for its own members. */
export async function getOrgName(orgId: string): Promise<string | null> {
  if ((await getScope()).orgId !== orgId) return null;
  const { data } = await createAdminClient().from("organizations").select("name").eq("id", orgId).maybeSingle();
  return (data?.name as string | null) ?? null;
}

/** `adjusted`: stock added through Voorraad aanpassen rather than on a round (21-10-2026). */
export type RefillVisit = { machineId: string; at: string; pieces: number; by: string | null; adjusted: boolean };

/**
 * Every time a machine was filled between two moments: when, how many pieces
 * and by whom (Xin, 20-10-2026), also when it went through Voorraad aanpassen
 * instead of a round (21-10-2026, Xin: "niet alleen op ronde"). The operator's
 * to see, for their own machines (none asked is all of them); anyone else gets none.
 */
export async function getRefillVisits(
  orgId: string,
  range: { from: string; to: string },
  machineIds: string[] | null,
): Promise<RefillVisit[]> {
  if (!(await isOperator()) || (await getScope()).orgId !== orgId) return [];
  const own = new Set((await getMachines(orgId)).map((machine) => machine.id));
  const asked = machineIds === null ? null : machineIds.filter((id) => own.has(id));
  if (asked !== null && asked.length === 0) return [];
  // A round still open has not filled anything yet (21-10-2026).
  const { data, error } = await createAdminClient().rpc("refill_visits_settled", {
    target_org: orgId,
    from_ts: range.from,
    to_ts: range.to,
    machine_filter: asked,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as { machine_id: string; filled_at: string; pieces: number; filled_by: string | null; adjusted: boolean }[])
    .filter((row) => own.has(row.machine_id))
    .map((row) => ({
      machineId: row.machine_id,
      at: row.filled_at,
      pieces: Number(row.pieces),
      by: row.filled_by,
      adjusted: Boolean(row.adjusted),
    }));
}

export async function getLastSales(orgId: string): Promise<Map<string, string | null>> {
  const { data } = await createAdminClient().rpc("dashboard_machine_last_sale", { target_org: orgId });
  const all = new Map(
    ((data ?? []) as { machine_id: string; last_sale: string | null }[]).map((r) => [r.machine_id, r.last_sale]),
  );
  const { businessId } = await getScope();
  if (!businessId) return all;
  const [machines, shared, { data: business }] = await Promise.all([
    getMachines(orgId),
    sharedSelections(orgId),
    createAdminClient().from("businesses").select("started_on").eq("id", businessId).eq("org_id", orgId).maybeSingle(),
  ]);
  const scoped = new Map<string, string | null>();
  await Promise.all(
    machines.map(async (machine) => {
      const own = shared?.get(machine.id);
      if (!own) return void scoped.set(machine.id, all.get(machine.id) ?? null);
      let query = createAdminClient()
        .from("transactions")
        .select("occurred_at")
        .eq("org_id", orgId)
        .eq("machine_id", machine.id)
        .eq("disposition", "APPROVED")
        .gt("amount", 0)
        .in("item_ref", own.size ? [...own] : [NOTHING]);
      // Where its sales start, as sales_start() has it: the terminal's date, else the shop's own.
      const start = machine.data_since ?? (business?.started_on as string | null | undefined) ?? null;
      if (start) query = query.gte("occurred_at", brusselsMidnight(start));
      const { data: last } = await query.order("occurred_at", { ascending: false }).limit(1).maybeSingle();
      scoped.set(machine.id, (last?.occurred_at as string | undefined) ?? null);
    }),
  );
  return scoped;
}

/** Midnight of a calendar day in Brussels, as a moment: how sales_start() reads a start date. */
function brusselsMidnight(day: string): string {
  const offset =
    new Intl.DateTimeFormat("en-US", { timeZone: DISPLAY_TIME_ZONE, timeZoneName: "shortOffset" })
      .formatToParts(new Date(`${day}T00:00:00Z`))
      .find((part) => part.type === "timeZoneName")?.value ?? "GMT+1";
  const hours = Number(offset.replace("GMT", "") || "0");
  return new Date(Date.parse(`${day}T00:00:00Z`) - hours * 3_600_000).toISOString();
}

export const PRODUCT_COLUMNS =
  "id, name, price, photo_path, archived, business_id, shelf_life_days, shelf_life_preset_id, producer_id, batch_min";

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

/** In how many slots each product is right now; a shop gets its own products only. */
export async function getProductSlotCounts(orgId: string): Promise<Map<string, number>> {
  await denyFillerAccess();
  const { businessId } = await getScope();
  const [{ data }, mine] = await Promise.all([
    createAdminClient().from("selection_assignments").select("product_id").eq("org_id", orgId).is("valid_to", null),
    businessId ? getProducts(orgId, { includeArchived: true }) : Promise.resolve(null),
  ]);
  const own = mine ? new Set(mine.map((product) => product.id)) : null;
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    if (own && !own.has(row.product_id)) continue;
    counts.set(row.product_id, (counts.get(row.product_id) ?? 0) + 1);
  }
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
  return data ? forScope(data, businessId) : null;
}

/**
 * The customer's own read-only page: no login, just the unguessable link.
 * Only what that page shows: never the operator's notes or contact details.
 */
export async function getBusinessByToken(
  token: string,
): Promise<(Pick<Business, "id" | "name" | "logo_path"> & { org_id: string }) | null> {
  if (!token) return null;
  const { data } = await createAdminClient()
    .from("businesses")
    .select("id, name, logo_path, org_id")
    .eq("share_token", token)
    .maybeSingle();
  return data && !isBlockedOrg(data.org_id) ? data : null;
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
  return (data ?? []).map((business) => forScope(business, businessId));
}

/** What the operator notes about a customer is not the customer's to read: one rule for every loader. */
function forScope<T extends { notes: string | null }>(business: T, businessId: string | null): T {
  return businessId ? { ...business, notes: null } : business;
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
  // Beside the stock it is shown with: a round still open has not filled anything yet (21-10-2026).
  const { data, error } = await createAdminClient().rpc("slot_freshness_settled", {
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
  const [{ data: written }, { data: open }] = await Promise.all([
    admin
      .from("stock_events")
      .select("occurred_at, type, delta, refill_sheet_id, filled_by, selection_number")
      .eq("org_id", orgId)
      .eq("machine_id", machineId)
      .order("occurred_at", { ascending: false })
      .limit(500),
    admin.from("refill_sheets").select("id").eq("org_id", orgId).is("completed_at", null),
  ]);
  // A round still open has not filled anything yet: its stops show once it is completed (21-10-2026).
  const pending = new Set((open ?? []).map((row) => row.id as string));
  const data = (written ?? []).filter((row) => !row.refill_sheet_id || !pending.has(row.refill_sheet_id as string));

  // A shop on a shared fridge counts its own slots only, and does not get the
  // e-mail address of whoever filled: that is the operator's staff, not theirs.
  let rows = data;
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

export async function getRefillSheets(orgId: string, page: { limit: number; offset: number } = { limit: 10, offset: 0 }): Promise<RefillSheet[]> {
  await denyFillerAccess();
  const mine = await ownMachineIds(orgId);
  const query = createAdminClient()
    .from("refill_sheets")
    .select("id, number, share_token, machine_ids, notes, lines, created_at, started_at, completed_at, filled_by, km, box, flow_version, stops, returns")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  // A shop's list is cut from the operator's, so it goes no further back than its latest ten.
  const { data } = await (mine ? query.limit(60) : query.range(page.offset, page.offset + page.limit - 1));
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
    .select("id, number, share_token, machine_ids, chosen_machine_ids, notes, lines, created_at, started_at, completed_at, filled_by, km, box, flow_version, stops, returns")
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
    .select("id, org_id, number, share_token, machine_ids, notes, lines, created_at, started_at, completed_at, filled_by, km, box, flow_version, stops, returns")
    .eq("share_token", token)
    // A step-by-step round (flow 2) is filled in Vendly itself, never through a link.
    .eq("flow_version", 1)
    .maybeSingle();
  // A link of an organisation this deployment does not serve opens nothing (see isBlockedOrg).
  if (!data || isBlockedOrg(data.org_id as string)) return null;
  const { org_id: _org, ...sheet } = data;
  return sheet as unknown as RefillSheet;
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

/** Whether the operator has a kitchen list to pass on: a dish made by one of their producers. Never for anyone else. */
export async function hasProducerDishes(orgId: string): Promise<boolean> {
  if (!(await isOperator()) || (await getScope()).orgId !== orgId) return false;
  const { count } = await createAdminClient()
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("archived", false)
    .not("producer_id", "is", null);
  return (count ?? 0) > 0;
}

// ── The production list (Xin, 19-10-2026) ────────────────────────────────────

export type ProductionList = {
  producerId: string;
  producerName: string;
  /** The round this list is for. */
  fillAt: string;
  lines: ProductionLine[];
};

/**
 * One producer's list, read with the service key. Not exported: the callers
 * below are the operator's own, and check that first.
 */
async function productionFor(orgId: string, producerId: string, producerName: string): Promise<ProductionList> {
  const admin = createAdminClient();
  const now = new Date();
  const daysAgo = (n: number) => reportDay(new Date(now.getTime() - n * 86_400_000), DISPLAY_TIME_ZONE);
  const report = (from: string, to: string) =>
    admin.rpc("stats_report", {
      target_org: orgId,
      period: "custom",
      custom_from: from,
      custom_to: to,
      machine_filter: null,
      business_filter: null,
      product_filter: null,
    });
  const [dishes, machines, stock, sales, hours, trend, fridge] = await Promise.all([
    admin.from("products").select("id, name, photo_path, batch_min").eq("org_id", orgId).eq("producer_id", producerId).eq("archived", false),
    admin.from("machines").select("id, refill_manual").eq("org_id", orgId).eq("excluded", false),
    // Machines and fridge as a round still open left them: neither has given or taken anything yet (21-10-2026).
    admin.rpc("machine_stock_settled", { target_org: orgId, machine_filter: null }),
    admin.rpc("slot_weekday_sales", { target_org: orgId, days: RATE_DAYS }),
    // The hours of the last eight weeks; the trend over four full weeks against the four before.
    report(daysAgo(RATE_DAYS), daysAgo(1)),
    report(daysAgo(28), daysAgo(1)),
    admin.rpc("producer_fridge_settled", { target_org: orgId, target_producer: producerId }),
  ]);
  for (const result of [dishes, machines, stock, sales, hours, trend, fridge]) {
    if (result.error) throw new Error(result.error.message);
  }
  const trendReport = trend.data as StatsReport;
  const plan = productionPlan({
    now,
    dishes: (dishes.data ?? []).map((d) => ({
      id: d.id as string,
      name: d.name as string,
      photoPath: (d.photo_path as string | null) ?? null,
      batchMin: Number(d.batch_min) || 1,
    })),
    manual: (machines.data ?? []).filter((m) => m.refill_manual).map((m) => m.id as string),
    slots: ((stock.data ?? []) as SlotStock[]).map((slot) => ({
      machineId: slot.machine_id,
      selection: slot.selection_number,
      productId: slot.product_id,
      capacity: slot.capacity,
      stock: slot.stock,
      countedAt: slot.counted_at,
    })),
    sales: ((sales.data ?? []) as { machine_id: string; selection_number: string; weekday: number; units: number; first_sale: string }[]).map(
      (row) => ({ machineId: row.machine_id, selection: row.selection_number, weekday: row.weekday, units: row.units, firstSale: row.first_sale }),
    ),
    hourUnits: (hours.data as StatsReport).by_hour,
    fridge: ((fridge.data ?? []) as { product_id: string; in_fridge: number | null; made_today: number }[]).map((row) => ({
      productId: row.product_id,
      inFridge: row.in_fridge,
      madeToday: row.made_today,
    })),
    trends: trendReport.by_product
      .filter((row) => row.product_id)
      .map((row) => ({ productId: row.product_id!, units: row.units, prevUnits: row.prev_units, firstSale: row.first_sale })),
    trendPrevStart: trendReport.prev_start,
  });
  return { producerId, producerName, fillAt: plan.fillAt.toISOString(), lines: plan.lines };
}

/** The operator's production lists: one per producer that makes something. Only the operator sees them. */
export async function getProductionLists(orgId: string): Promise<ProductionList[]> {
  await requireOperator();
  const admin = createAdminClient();
  const [{ data: producers, error }, { data: made }] = await Promise.all([
    admin.from("producers").select("id, name").eq("org_id", orgId).order("name"),
    admin.from("products").select("producer_id").eq("org_id", orgId).eq("archived", false).not("producer_id", "is", null),
  ]);
  if (error) throw new Error(error.message);
  const busy = new Set((made ?? []).map((row) => row.producer_id as string));
  return Promise.all(
    (producers ?? [])
      .filter((producer) => busy.has(producer.id as string))
      .map((producer) => productionFor(orgId, producer.id as string, producer.name as string)),
  );
}

export type OrderLine = { name: string; qty: number };

/**
 * The operator passes tonight's list on to the kitchen (Xin, 19-10-2026: the
 * kitchen types nothing). What is passed on counts as made tonight, so the
 * fridge follows without anyone counting. The amounts are worked out again
 * here, never taken from the screen; passing on twice only adds what became
 * needed since, because what was passed on is already in the fridge. Returns
 * everything passed on today, for the message to the kitchen.
 */
export async function sendProductionOrder(orgId: string, producerId: string): Promise<OrderLine[]> {
  await requireOperator();
  const admin = createAdminClient();
  const { data: producer } = await admin.from("producers").select("id, name").eq("org_id", orgId).eq("id", producerId).maybeSingle();
  if (!producer) throw new Error("Not found");
  const list = await productionFor(orgId, producerId, producer.name as string);
  const today = reportDay(new Date(), DISPLAY_TIME_ZONE);
  const by = displayName(await getSessionUser())?.slice(0, 80) ?? null;
  const rows = list.lines
    .filter((line) => line.make > 0)
    .map((line) => ({ org_id: orgId, producer_id: producerId, product_id: line.productId, kind: "made", qty: line.make, made_on: today, by_name: by }));
  if (rows.length > 0) {
    const { error } = await admin.from("producer_stock_events").insert(rows);
    if (error) throw new Error(error.message);
  }
  const { data: passed, error } = await admin
    .from("producer_stock_events")
    .select("product_id, qty")
    .eq("org_id", orgId)
    .eq("producer_id", producerId)
    .eq("kind", "made")
    .eq("made_on", today);
  if (error) throw new Error(error.message);
  const names = new Map(list.lines.map((line) => [line.productId, line.name]));
  const totals = new Map<string, number>();
  for (const row of passed ?? []) totals.set(row.product_id as string, (totals.get(row.product_id as string) ?? 0) + Number(row.qty));
  return [...totals]
    .map(([productId, qty]) => ({ name: names.get(productId) ?? "—", qty }))
    .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
}

/**
 * What the operator counted in a producer's fridge, for one of the producer's
 * own dishes: the level the fridge is followed from again.
 */
export async function countProducerFridge(orgId: string, producerId: string, productId: string, qty: number): Promise<void> {
  await requireOperator();
  if (!Number.isInteger(qty) || qty < 0 || qty > 9999) throw new Error("invalid quantity");
  const admin = createAdminClient();
  const { data: dish } = await admin
    .from("products")
    .select("id")
    .eq("org_id", orgId)
    .eq("producer_id", producerId)
    .eq("id", productId)
    .maybeSingle();
  if (!dish) throw new Error("Not found");
  const { error } = await admin.from("producer_stock_events").insert({
    org_id: orgId,
    producer_id: producerId,
    product_id: productId,
    kind: "count",
    qty,
    by_name: displayName(await getSessionUser())?.slice(0, 80) ?? null,
  });
  if (error) throw new Error(error.message);
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
  /** Machines that take a layout: all but the "other" kind, which has no slots to draw. */
  layoutable: number;
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
    admin.from("machines").select("id, name, payter_serial_number, type").eq("org_id", orgId).eq("excluded", false),
    admin.from("slots").select("machine_id").eq("org_id", orgId),
    admin.from("products").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("archived", false),
    admin.from("selection_assignments").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("valid_to", null),
  ]);

  const all = machines.data ?? [];
  // A machine keeps its serial as a name until somebody gives it a real one.
  const named = all.filter((m) => m.name && m.name !== m.payter_serial_number).length;
  // Only machines that are counted and can take a layout: an excluded terminal's
  // old slots or an "other" machine would keep the step open for good.
  const layoutIds = new Set(all.filter((m) => m.type !== "other").map((m) => m.id as string));
  const withLayout = new Set((slots.data ?? []).map((s) => s.machine_id as string).filter((id) => layoutIds.has(id))).size;

  const state = {
    // A demo has invented sales and no Payter login, and is set up all the same.
    payterConnected: Boolean(credentials.data) || Boolean(org.data?.is_demo),
    machines: all.length,
    namedMachines: named,
    layoutable: layoutIds.size,
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
      state.withLayout === state.layoutable &&
      state.products > 0 &&
      state.linkedSelections > 0,
  };
}

/** Refuses unless the caller's scope contains this machine. */
export async function requireMachineAccess(orgId: string, machineId: string): Promise<void> {
  await denyFillerAccess();
  if (!(await getMachine(orgId, machineId))) throw new Error("Not found");
}

type CameraRow = { machine_id: string; console_id: string; camera_id: string; name: string | null };
const toLinked = (row: CameraRow): LinkedCamera => ({ consoleId: row.console_id, cameraId: row.camera_id, name: row.name });

/**
 * The UniFi cameras aimed at a machine (machine_cameras; since 21-10-2026 a
 * machine can have several), for "Toon automaat nu", Live and the recording of
 * each payment. The operator's alone (the cameras are theirs, not a shop's or
 * a filler's), and only where UniFi is set up for this organisation.
 */
export async function getCamerasOf(orgId: string, machineId: string): Promise<LinkedCamera[]> {
  await requireOperator();
  await requireMachineAccess(orgId, machineId);
  if (!camerasEnabled(orgId)) return [];
  const { data, error } = await createAdminClient()
    .from("machine_cameras")
    .select("machine_id, console_id, camera_id, name")
    .eq("machine_id", machineId)
    .order("position")
    .order("created_at");
  if (error) throw new Error(error.message);
  return ((data ?? []) as CameraRow[]).map(toLinked);
}

/**
 * The cameras of every machine that has one, by machine id, for "watch on
 * camera" next to each payment. The operator's alone, like the cameras
 * themselves; empty for anyone else and where UniFi is not set up.
 */
export async function getMachineCameras(orgId: string): Promise<Record<string, LinkedCamera[]>> {
  if (!(await isOperator()) || !camerasEnabled(orgId)) return {};
  const { data, error } = await createAdminClient()
    .from("machine_cameras")
    .select("machine_id, console_id, camera_id, name, machines!inner(org_id, excluded)")
    .eq("machines.org_id", orgId)
    .eq("machines.excluded", false)
    .order("position")
    .order("created_at");
  if (error) throw new Error(error.message);
  const byMachine: Record<string, LinkedCamera[]> = {};
  for (const row of (data ?? []) as unknown as CameraRow[]) (byMachine[row.machine_id] ??= []).push(toLinked(row));
  return byMachine;
}

/**
 * The selections a shop owns on each shared machine it is in. On a shared
 * machine a slot belongs to the business it names, or else to the machine's
 * first business (as sale_business decides); a selection without a slot
 * belongs to neither shop. Null for the operator, who owns every slot.
 */
const sharedSelections = cache(async (orgId: string): Promise<Map<string, Set<string>> | null> => {
  const { businessId } = await getScope();
  if (!businessId) return null;
  const admin = createAdminClient();
  // A failed read must refuse, never pass: an empty answer here would make
  // every shared machine look like the shop's alone.
  const { data: machines, error } = await admin
    .from("machines")
    .select("id, business_id, shared_business_id")
    .eq("org_id", orgId)
    .not("shared_business_id", "is", null);
  if (error) throw new Error(error.message);
  const shared = (machines ?? []).filter((m) => m.business_id === businessId || m.shared_business_id === businessId);
  const owned = new Map<string, Set<string>>(shared.map((m) => [m.id as string, new Set<string>()]));
  if (shared.length === 0) return owned;
  const { data: slots, error: slotsError } = await admin
    .from("slots")
    .select("machine_id, selection_number, business_id")
    .eq("org_id", orgId)
    .in("machine_id", shared.map((m) => m.id as string));
  if (slotsError) throw new Error(slotsError.message);
  for (const slot of slots ?? []) {
    const machine = shared.find((m) => m.id === slot.machine_id);
    if (!machine) continue;
    const owner = [machine.business_id, machine.shared_business_id].includes(slot.business_id)
      ? slot.business_id
      : machine.business_id;
    if (owner === businessId) owned.get(machine.id as string)!.add(slot.selection_number as string);
  }
  return owned;
});

/**
 * The slots of a machine the caller may change, for the screens that offer
 * it: null for all of them, else a shop's own slots on a shared machine.
 */
/** A product as whoever fills sees it while laying out a machine: its name and photo, never a price. */
export type Dish = { id: string; name: string; photoPath: string | null };

/**
 * Refuses unless whoever fills (the operator or a filler, never a shop) may lay
 * out this machine from its refill page (Xin, 17-10-2026): one of the
 * organisation's own machines, and not a shared one, whose slots belong to two
 * businesses; that layout stays the operator's, in the builder.
 */
export async function requireRefillLayoutAccess(orgId: string, machineId: string): Promise<Machine> {
  if ((await requireRefillAccess()) !== orgId) throw new Error("Not found");
  const machine = await getMachine(orgId, machineId);
  if (!machine || machine.shared_business_id) throw new Error("Not found");
  return machine;
}

/**
 * The products that may go in this machine, for whoever lays it out from its
 * refill page: the machine's business's own, or the organisation's for a
 * machine of no business, as a new product made from a machine is. No prices.
 */
export async function getDishes(orgId: string, machineId: string): Promise<Dish[]> {
  const machine = await requireRefillLayoutAccess(orgId, machineId);
  let query = createAdminClient().from("products").select("id, name, photo_path").eq("org_id", orgId).eq("archived", false);
  query = machine.business_id ? query.eq("business_id", machine.business_id) : query.is("business_id", null);
  const { data, error } = await query.order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ id: row.id as string, name: row.name as string, photoPath: (row.photo_path as string | null) ?? null }));
}

export async function getOwnSelections(orgId: string, machineId: string): Promise<string[] | null> {
  await requireMachineAccess(orgId, machineId);
  const own = (await sharedSelections(orgId))?.get(machineId);
  return own ? [...own] : null;
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
