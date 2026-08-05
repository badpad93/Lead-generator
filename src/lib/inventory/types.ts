/**
 * Inventory & Procurement — shared TypeScript types.
 *
 * Mirrors migration 137's tables exactly. Every field's shape and
 * nullability matches what the DB returns so consumers can treat rows
 * as their typed row shape without re-mapping.
 */

export type TransactionType =
  | "initial_balance"
  | "receipt"
  | "consumption"
  | "consumption_reversal"
  | "spoilage"
  | "waste"
  | "damage"
  | "return"
  | "manual_adjustment"
  | "count_adjustment"
  | "transfer_out"
  | "transfer_in";

export type ForecastMethod = "simple" | "weighted";

// Reference-type strings written to inventory_transactions.reference_type.
// Left as a string union so future upstreams can add without a migration.
export type ReferenceType =
  | "coffee_order"
  | "purchase_order"
  | "physical_count"
  | "manual"
  | "transfer";

// ─── Row shapes (as returned from the DB) ────────────────────────────

export interface WarehouseRow {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

export interface SupplierRow {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  lead_time_days: number;
  minimum_order_qty: number | null;
  payment_terms: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

export interface InventorySkuRow {
  id: string;
  sku_code: string;
  name: string;
  description: string | null;
  category: string;
  unit_of_measure: string;
  pack_size: number;
  coffee_product_id: string | null;
  preferred_supplier_id: string | null;
  lead_time_days_override: number | null;
  safety_stock_pct_override: number | null;
  lookback_weeks_override: number | null;
  forecast_method_override: ForecastMethod | null;
  active: boolean;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

export interface WeightBucket {
  weeks_back_from: number;
  weeks_back_to: number;
  weight: number;
}

export interface InventoryConfigurationRow {
  id: string;
  default_lookback_weeks: number;
  default_safety_stock_pct: number;
  default_order_cycle_days: number;
  default_forecast_method: ForecastMethod;
  default_weight_config: WeightBucket[];
  current_formula_version: number;
  spike_threshold_multiplier: number;
  min_valid_weeks: number;
  updated_at: string;
  updated_by: string | null;
}

export interface InventoryTransactionRow {
  id: string;
  sku_id: string;
  warehouse_id: string;
  transaction_type: TransactionType;
  qty_delta: number;
  reason: string | null;
  reference_type: ReferenceType | string | null;
  reference_id: string | null;
  counterparty_warehouse_id: string | null;
  reverses_transaction_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface PhysicalCountRow {
  id: string;
  sku_id: string;
  warehouse_id: string;
  counted_qty: number;
  computed_on_hand_at_count: number;
  variance: number;
  adjustment_transaction_id: string | null;
  counted_by: string | null;
  counted_at: string;
  notes: string | null;
}

// ─── Input shapes (what the ledger service accepts) ─────────────────

export interface PostTransactionInput {
  skuId: string;
  warehouseId: string;
  transactionType: TransactionType;
  qtyDelta: number;
  reason?: string | null;
  referenceType?: ReferenceType | string | null;
  referenceId?: string | null;
  counterpartyWarehouseId?: string | null;
  reversesTransactionId?: string | null;
  notes?: string | null;
  createdBy?: string | null;
}

export interface PostPhysicalCountInput {
  skuId: string;
  warehouseId: string;
  countedQty: number;
  countedBy?: string | null;
  notes?: string | null;
}

export interface PostPhysicalCountResult {
  physicalCount: PhysicalCountRow;
  adjustmentTransaction: InventoryTransactionRow | null; // null when variance = 0
  computedOnHandBefore: number;
  computedOnHandAfter: number;
}

// Transaction types that REQUIRE a reason (enforced in the service layer).
export const REASON_REQUIRED_TYPES: TransactionType[] = [
  "manual_adjustment",
  "spoilage",
  "waste",
  "damage",
  "count_adjustment",
];

// Sign convention — the service validates that the sign matches the
// direction the transaction type implies.
export const POSITIVE_DELTA_TYPES: TransactionType[] = [
  "initial_balance",
  "receipt",
  "consumption_reversal",
  "return",
  "transfer_in",
];

export const NEGATIVE_DELTA_TYPES: TransactionType[] = [
  "consumption",
  "spoilage",
  "waste",
  "damage",
  "transfer_out",
];

// Both signs valid.
export const EITHER_SIGN_TYPES: TransactionType[] = [
  "manual_adjustment",
  "count_adjustment",
];
