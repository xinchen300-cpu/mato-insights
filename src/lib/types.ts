import type { ReturnRow, StopRecord } from "@/lib/refill-flow";

export type Period = "today" | "week" | "month" | "last30" | "custom";
export const PERIODS: Period[] = ["today", "week", "month", "last30", "custom"];

export type MachineType = "lift" | "spiral" | "locker" | "other";
export const MACHINE_TYPES: MachineType[] = ["lift", "spiral", "locker", "other"];

export type SlotSize = "small" | "large" | "wide" | "ice";
export const SLOT_SIZES: SlotSize[] = ["small", "large", "wide", "ice"];

export type Totals = { revenue: number; units: number; prev_revenue: number; prev_units: number };

export type StatsReport = {
  period: Period;
  timezone: string;
  cur_start: string;
  cur_end: string;
  prev_start: string;
  prev_end: string;
  /** The selection's first counted sale ever, with the same filters and start dates. */
  first_sale: string | null;
  totals: Totals;
  by_day: { day: string; revenue: number; units: number }[];
  by_hour: { hour: number; revenue: number; units: number }[];
  by_weekday: { weekday: number; revenue: number; units: number }[];
  by_machine: ({ machine_id: string; machine_name: string; business_name: string | null; first_sale: string | null } & Totals)[];
  by_product: ({
    product_id: string | null;
    product_name: string | null;
    photo_path: string | null;
    first_sale: string | null;
  } & Totals)[];
};

export type Machine = {
  id: string;
  name: string;
  type: MachineType | null;
  payter_serial_number: string | null;
  business_id: string | null;
  /** Set when the machine is split between two businesses. */
  shared_business_id: string | null;
  business_name: string | null;
  business_logo_path: string | null;
  data_since: string | null;
  km_round_trip: number | null;
  /** The tile photo in the media bucket; null shows the placeholder. */
  photo_path: string | null;
  /** From Payter: its standing connection's last connect and disconnect. */
  last_connected_at: string | null;
  last_disconnected_at: string | null;
  terminal_model: string | null;
  terminal_network: string | null;
  terminal_flags: string[];
};

export type SlotStock = {
  machine_id: string;
  slot_id: string;
  row_position: number;
  slot_position: number;
  selection_number: string;
  size: SlotSize;
  capacity: number;
  product_id: string | null;
  product_name: string | null;
  photo_path: string | null;
  price: number | null;
  /** Who the slot's sales count for: the product's business, else the machine's. */
  business_id: string | null;
  level_after: number | null;
  counted_at: string | null;
  sales_since: number;
  stock: number | null;
};

export type Product = {
  id: string;
  name: string;
  price: number | null;
  photo_path: string | null;
  archived: boolean;
  /** The business that supplies it — Televend's "categorie". */
  business_id: string | null;
  /** Days the product keeps after filling; falls back to its category. */
  shelf_life_days: number | null;
  shelf_life_preset_id: string | null;
  producer_id: string | null;
};

export type Business = {
  id: string;
  name: string;
  logo_path: string | null;
  started_on: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  share_token: string | null;
};

export type UnassignedGroup = {
  machine_id: string;
  machine_name: string;
  selection_number: string;
  sales: number;
  revenue: number;
  last_sale: string;
  typical_price: number | null;
};

export type LayoutRowSpec = { size: SlotSize; slots: number; depth: number; step: number };

export type LayoutTemplate = {
  id: string;
  org_id: string | null;
  name: string;
  machine_type: MachineType | null;
  layout: LayoutRowSpec[];
};

export type RefillLine = {
  machine_id: string;
  machine_name: string;
  row_position: number;
  slot_position: number;
  selection_number: string;
  product_id: string;
  product_name: string;
  photo_path: string | null;
  stock: number;
  capacity: number;
  to_add: number;
  shelf_life_days: number | null;
  /** The date the oldest stock in the slot runs out, before this refill. */
  next_expires_at: string | null;
  qty_expired: number;
};

export type RefillSheet = {
  id: string;
  share_token: string;
  /** The machines the round goes to: the ones with something to fill. */
  machine_ids: string[];
  /**
   * Every machine chosen for the round, in its order, also one that stood full
   * and is passed by. Empty before 17-10-2026; absent where it is not read.
   */
  chosen_machine_ids?: string[];
  notes: string | null;
  lines: RefillLine[];
  created_at: string;
  /** When the filler opened the sheet; the run's clock starts here. */
  started_at: string | null;
  completed_at: string | null;
  filled_by: string | null;
  km: number | null;
  /** Pieces per product the filler has taken from the fridge so far. */
  box: Record<string, number>;
  /** 1: filled through a share link at once. 2: step by step in Vendly, per stop. */
  flow_version: number;
  /** Flow 2: per machine id, when it was finished or skipped. */
  stops: Record<string, StopRecord>;
  /** Flow 2, once closed: what came back from the round and where it went. */
  returns: ReturnRow[] | null;
};

export type Producer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
};

/** One product's line in the report that closes a run. */
export type RunSummaryRow = {
  product_id: string;
  product_name: string;
  producer_id: string | null;
  producer_name: string | null;
  filled: number;
  expired: number;
  short: number;
};

/** What a fridge could not supply on a run, per product. */
export type Shortage = {
  product_id: string | null;
  product_name: string | null;
  qty: number;
  noted_at: string;
};

export type RefillEvent = {
  occurred_at: string;
  type: "refill" | "correction";
  refill_sheet_id: string | null;
  filled_by: string | null;
  added: number;
  slots: number;
};

export type RecentSale = {
  occurred_at: string;
  amount: number;
  product_name: string | null;
  photo_path: string | null;
  machine_name: string;
};

export type PaymentHealth = {
  machine_id: string;
  approved: number;
  declined: number;
  failed: number;
  declined_amount: number;
  failed_amount: number;
  last_problem_at: string | null;
};

/** One payment attempt; amount is what the customer tried to pay. */
export type PaymentEntry = {
  occurred_at: string;
  amount: number;
  disposition: string;
  product_name: string | null;
  selection_number: string | null;
};

/** One machine's sales, split per business — a shared machine has two rows. */
export type MachineSalesSplit = { business_id: string; business_name: string; units: number; revenue: number };

export type ExpiryAlert = {
  machine_id: string;
  machine_name: string;
  selection_number: string;
  product_name: string | null;
  business_id: string | null;
  business_name: string | null;
  qty_expired: number;
  qty_expiring_24h: number;
  next_expires_at: string | null;
  hours_left: number | null;
};

export type SlowMover = {
  machine_id: string;
  machine_name: string;
  selection_number: string;
  product_id: string | null;
  product_name: string | null;
  business_id: string | null;
  capacity: number;
  units_per_day: number;
  days_to_sell_full: number | null;
  shelf_life_days: number | null;
  always_expires: boolean;
};

export type BusinessFreshness = {
  qty_expired: number;
  qty_expiring_24h: number;
  next_expires_at: string | null;
  last_refill_at: string | null;
};

/** A named shelf life ("fresh meal, 3 days") shared by many products. */
export type ShelfLifePreset = { id: string; name: string; days: number };

/** One product's share of the bin over a period. */
export type WasteRow = {
  product_id: string;
  product_name: string;
  producer_id: string | null;
  producer_name: string | null;
  business_id: string | null;
  qty_expired: number;
  value_expired: number;
  qty_sold: number;
  value_sold: number;
  share_expired: number | null;
};

/** A slot whose sales do not match the price of the product linked to it. */
export type PriceMismatch = {
  machine_id: string;
  machine_name: string;
  selection_number: string;
  product_id: string;
  product_name: string;
  business_id: string | null;
  list_price: number;
  sales: number;
  off_price: number;
  distinct_prices: number;
  spread: number;
  usual_price: number;
};
