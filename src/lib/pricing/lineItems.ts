/**
 * Line items — the single source of truth for order/agreement money.
 *
 * Before this module, line totals were computed in six places with six
 * different formulas: POST /orders applied discount_percent, POST
 * /orders/[id]/items did not; the agreement creation route summed
 * total_price (discount-aware) while the agreement PATCH route
 * recomputed qty x unit_price (discount-blind); creation excluded
 * location services from the contract total and PATCH included them.
 * The result was that the same order produced a different agreement
 * total depending on which route touched it last.
 *
 * Everything that turns line items into money now calls into here.
 *
 * Three data hazards this module absorbs so callers don't have to:
 *
 *   1. `item_type` is free text. Production holds `coffee` (written by
 *      the storefront mirror) alongside `coffee_program` (written by the
 *      CRM), and `shipping` alongside freight lines typed `other`.
 *      normalizeItemType + categorize collapse both vocabularies.
 *
 *   2. Legacy rows (migration 082 era) carry the amount ONLY in the
 *      old `price` column with unit_price/total_price left at 0.
 *      lineTotal detects that exact shape and reads `price`.
 *
 *   3. A legitimately $0 line (a 100% discount, a comped machine) must
 *      stay $0. The old `Number(total_price) || qty * unit_price`
 *      idiom repriced those to full because 0 is falsy.
 */

/* ------------------------------------------------------------------ */
/*  Taxonomy                                                          */
/* ------------------------------------------------------------------ */

/** The canonical `order_items.item_type` values. Enforced by the CHECK
 *  constraint added in migration 182. */
export const CANONICAL_ITEM_TYPES = [
  "machine_sale",
  "vendera_ai_cooler",
  "combo_machine",
  "location_services",
  "coffee_program",
  "freight",
  "financing",
  "other",
] as const;

export type CanonicalItemType = (typeof CANONICAL_ITEM_TYPES)[number];

/** Coarser grouping used to decide which agreement schedules apply and
 *  how the contract's payment summary is grouped. */
export type ItemCategory =
  | "equipment"
  | "location_services"
  | "coffee"
  | "freight"
  | "financing"
  | "other";

/** Legacy / alias spellings seen in production, mapped to canonical. */
const TYPE_ALIASES: Record<string, CanonicalItemType> = {
  // storefront mirror (src/lib/coffeeCrmMirror.ts) writes "coffee"
  coffee: "coffee_program",
  coffee_supply: "coffee_program",
  brewer: "coffee_program",
  // the mirror's shipping line, plus older hand-entered rows
  shipping: "freight",
  delivery: "freight",
  // equipment spellings
  machine: "machine_sale",
  cooler: "vendera_ai_cooler",
  combo: "combo_machine",
  // services
  location: "location_services",
  location_service: "location_services",
};

const TYPE_TO_CATEGORY: Record<CanonicalItemType, ItemCategory> = {
  machine_sale: "equipment",
  vendera_ai_cooler: "equipment",
  combo_machine: "equipment",
  location_services: "location_services",
  coffee_program: "coffee",
  freight: "freight",
  financing: "financing",
  other: "other",
};

/** Rescue patterns for rows typed `other` whose name says what they
 *  really are. Applied ONLY to `other` so an explicitly-typed line is
 *  never second-guessed by its label. */
const NAME_RESCUE: Array<{ re: RegExp; category: ItemCategory }> = [
  { re: /\b(freight|shipping|delivery|drayage)\b/i, category: "freight" },
  { re: /\blocation (services?|sourcing|placement)\b/i, category: "location_services" },
  { re: /\b(financ|lease|10\/10\/10)/i, category: "financing" },
  { re: /\b(coffee|brewer|espresso)\b/i, category: "coffee" },
];

/** Shipping charged against a coffee program is still shipping.
 *
 *  Reps and the catalog both type lines like "Coffee Machine Freight"
 *  as coffee_program. Left alone, one of those would drag the Equipment
 *  Loan & Beverage Supply Agreement into a contract that has no brewer
 *  on it (PR #710), and put freight in the coffee bucket on the
 *  contract's payment summary. */
const FREIGHT_BY_NAME = /\b(freight|shipping|drayage)\b/i;

export function normalizeItemType(raw: unknown): CanonicalItemType {
  const key = String(raw ?? "").trim().toLowerCase();
  if (!key) return "other";
  if ((CANONICAL_ITEM_TYPES as readonly string[]).includes(key)) {
    return key as CanonicalItemType;
  }
  return TYPE_ALIASES[key] ?? "other";
}

export interface LineItemLike {
  item_type?: unknown;
  service_name?: unknown;
  description?: unknown;
  quantity?: unknown;
  unit_price?: unknown;
  /** Legacy column from migration 009. Unit price, not line total. */
  price?: unknown;
  discount_percent?: unknown;
  total_price?: unknown;
  deposit_required?: unknown;
  location_deposit_amount?: unknown;
  location_service_price?: unknown;
  product_id?: unknown;
  status?: unknown;
}

export function categorize(item: LineItemLike): ItemCategory {
  const type = normalizeItemType(item.item_type);
  const name = String(item.service_name ?? "");

  if (type === "coffee_program" && FREIGHT_BY_NAME.test(name)) return "freight";
  if (type !== "other") return TYPE_TO_CATEGORY[type];

  for (const { re, category } of NAME_RESCUE) {
    if (re.test(name)) return category;
  }
  return "other";
}

/* ------------------------------------------------------------------ */
/*  Money                                                             */
/* ------------------------------------------------------------------ */

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Discounts are a percentage, and only ever 0-100. */
function clampPercent(v: unknown): number {
  const n = toNum(v) ?? 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

function applyDiscount(gross: number, discountPercent: number): number {
  return round2(gross * (1 - discountPercent / 100));
}

/** Authoritative line total from quantity, unit price and discount.
 *  Use this on every WRITE path so the stored total_price is correct. */
export function computeLineTotal(
  quantity: unknown,
  unitPrice: unknown,
  discountPercent: unknown,
): number {
  const qty = toNum(quantity) ?? 1;
  const unit = toNum(unitPrice) ?? 0;
  return applyDiscount(qty * unit, clampPercent(discountPercent));
}

function isEmptyAmount(v: number | null): boolean {
  return v === null || v === 0;
}

/**
 * The migration-082-era shape: the amount lives in the old `price`
 * column and unit_price / total_price were never populated. Five live
 * orders are still in this state (see migration 182), and reading
 * total_price on them yields $0.
 */
function isLegacyPriceOnly(
  stored: number | null,
  unit: number | null,
  legacy: number | null,
): boolean {
  if (!isEmptyAmount(stored)) return false;
  if (!isEmptyAmount(unit)) return false;
  return legacy !== null && legacy > 0;
}

/** Effective unit price for a stored row, tolerating the legacy
 *  `price`-only shape. */
export function unitPriceOf(item: LineItemLike): number {
  const unit = toNum(item.unit_price);
  if (!isEmptyAmount(unit)) return unit as number;
  const legacy = toNum(item.price);
  if (!isEmptyAmount(legacy)) return legacy as number;
  return 0;
}

/**
 * Line total for a row already in the database.
 *
 * Precedence:
 *   1. The legacy `price`-only shape -> qty x price, discounted.
 *   2. A stored total_price, INCLUDING an explicit 0. The old
 *      `Number(total_price) || qty * unit_price` idiom repriced a
 *      100%-discounted or comped line back to full, because 0 is falsy.
 *   3. Recompute from quantity x unit price x (1 - discount).
 */
export function lineTotal(item: LineItemLike): number {
  const stored = toNum(item.total_price);
  const unit = toNum(item.unit_price);
  const legacy = toNum(item.price);
  const qty = toNum(item.quantity) ?? 1;
  const discount = clampPercent(item.discount_percent);

  if (isLegacyPriceOnly(stored, unit, legacy)) {
    return applyDiscount(qty * (legacy as number), discount);
  }
  if (stored !== null) return round2(stored);
  return applyDiscount(qty * (unit ?? 0), discount);
}

export function sumLines(items: LineItemLike[]): number {
  return round2(items.reduce((sum, i) => sum + lineTotal(i), 0));
}

/** Lines whose money is deferred (invoiced later, not part of the
 *  upfront amount due). */
export function isDeferred(item: LineItemLike): boolean {
  return String(item.status ?? "") === "pending_fulfillment";
}

export interface OrderTotals {
  /** Everything, including deferred lines. */
  grandTotal: number;
  /** What the customer owes now — excludes deferred lines. */
  upfrontTotal: number;
  depositTotal: number;
  deferredTotal: number;
}

export function orderTotals(items: LineItemLike[]): OrderTotals {
  let upfront = 0;
  let deferred = 0;
  let deposit = 0;
  for (const item of items) {
    const total = lineTotal(item);
    if (isDeferred(item)) deferred += total;
    else upfront += total;
    if (item.deposit_required) {
      deposit += toNum(item.location_deposit_amount) ?? 0;
    }
  }
  return {
    grandTotal: round2(upfront + deferred),
    upfrontTotal: round2(upfront),
    depositTotal: round2(deposit),
    deferredTotal: round2(deferred),
  };
}

/** Remaining balance that respects a paid deposit, instead of stamping
 *  the full total over it on every item edit. */
export function remainingBalance(
  total: number,
  depositAmount: unknown,
  depositPaid: unknown,
): number {
  const deposit = toNum(depositAmount) ?? 0;
  return round2(depositPaid === true ? Math.max(0, total - deposit) : total);
}

/* ------------------------------------------------------------------ */
/*  Agreement snapshot                                                */
/* ------------------------------------------------------------------ */

export interface SnapshotLine {
  item_type: CanonicalItemType;
  category: ItemCategory;
  service_name: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  total_price: number;
  deferred: boolean;
  deposit_required: boolean;
  location_deposit_amount: number | null;
  product_id: string | null;
}

/**
 * Freeze the order's line items onto the agreement. This is what the
 * contract, its PDF and any order rebuilt from it all read — the
 * scalar columns on purchase_agreements are a derived cache from here
 * on, never an input.
 */
export function buildLineItemsSnapshot(items: LineItemLike[]): SnapshotLine[] {
  return items.map((i) => ({
    item_type: normalizeItemType(i.item_type),
    category: categorize(i),
    service_name: String(i.service_name ?? "").trim() || "Item",
    description: i.description == null ? null : String(i.description),
    quantity: toNum(i.quantity) ?? 1,
    unit_price: round2(unitPriceOf(i)),
    discount_percent: clampPercent(i.discount_percent),
    total_price: lineTotal(i),
    deferred: isDeferred(i),
    deposit_required: i.deposit_required === true,
    location_deposit_amount: toNum(i.location_deposit_amount),
    product_id: i.product_id == null ? null : String(i.product_id),
  }));
}

export interface AgreementTotals {
  byCategory: Record<ItemCategory, number>;
  /** Sum of every non-deferred line — what the contract's TOTAL DUE
   *  PRIOR TO PROCUREMENT must equal. */
  totalDuePriorToProcurement: number;
  deferredTotal: number;
  grandTotal: number;
  // Legacy scalar columns, still written so older readers and the
  // pre-snapshot PDF fallback keep working.
  equipmentSubtotal: number;
  machineQuantity: number;
  machineUnitPrice: number;
  machineModel: string | null;
  locationsPurchased: number;
  locationFeePerSecured: number;
  maxLocationServiceValue: number;
  freightTotal: number;
  freightPerMachine: number;
}

const EMPTY_BY_CATEGORY = (): Record<ItemCategory, number> => ({
  equipment: 0,
  location_services: 0,
  coffee: 0,
  freight: 0,
  financing: 0,
  other: 0,
});

/**
 * Contract totals derived from the snapshot.
 *
 * The headline number is additive over EVERY line. Previously it was
 * `equipmentSubtotal + freightTotal`, which silently dropped location
 * services, coffee, coolers, financing and custom lines while the PDF
 * still printed some of them above the total — so the contract did not
 * add up.
 */
export function agreementTotals(snapshot: SnapshotLine[]): AgreementTotals {
  const byCategory = EMPTY_BY_CATEGORY();
  let upfront = 0;
  let deferred = 0;

  for (const line of snapshot) {
    byCategory[line.category] = round2(byCategory[line.category] + line.total_price);
    if (line.deferred) deferred += line.total_price;
    else upfront += line.total_price;
  }

  // Quantities and per-unit rates come from the lines the customer is
  // being invoiced for now. A deferred line — the location-services
  // balance invoiced on fulfillment — carries a quantity of 1 that is
  // a balance, not another location, so counting it made the contract
  // say "10 locations at $440" for an order of 9 locations at $400.
  const billable = snapshot.filter((l) => !l.deferred);

  const equipmentLines = billable.filter((l) => l.category === "equipment");
  const machineQuantity = equipmentLines.reduce((s, l) => s + (l.quantity || 0), 0);
  const equipmentSubtotal = round2(
    equipmentLines.reduce((s, l) => s + l.total_price, 0),
  );
  // Weighted average, so a mixed-price equipment order reports a unit
  // price that actually reconciles with its subtotal. The old code took
  // the first line's price and let the rest disappear.
  const machineUnitPrice =
    machineQuantity > 0 ? round2(equipmentSubtotal / machineQuantity) : 0;

  const billableLocationLines = billable.filter((l) => l.category === "location_services");
  const locationsPurchased = billableLocationLines.reduce((s, l) => s + (l.quantity || 0), 0);
  const billableLocationTotal = round2(
    billableLocationLines.reduce((s, l) => s + l.total_price, 0),
  );
  const locationFeePerSecured =
    locationsPurchased > 0 ? round2(billableLocationTotal / locationsPurchased) : 0;
  // The contract's "maximum service value" is the whole location
  // commitment, deferred balance included.
  const maxLocationServiceValue = byCategory.location_services;

  const freightTotal = byCategory.freight;

  return {
    byCategory,
    totalDuePriorToProcurement: round2(upfront),
    deferredTotal: round2(deferred),
    grandTotal: round2(upfront + deferred),
    equipmentSubtotal,
    machineQuantity,
    machineUnitPrice,
    machineModel: equipmentLines[0]?.service_name ?? null,
    locationsPurchased,
    locationFeePerSecured,
    maxLocationServiceValue,
    freightTotal,
    freightPerMachine:
      machineQuantity > 0 ? round2(freightTotal / machineQuantity) : round2(freightTotal),
  };
}

export interface AgreementSections {
  include_equipment: boolean;
  include_location_services: boolean;
  include_shipping_storage: boolean;
  include_financing: boolean;
  coffee_supply_required: boolean;
}

/**
 * Which schedules this contract gets, decided by what was actually
 * sold. Every order now produces an agreement, so the document has to
 * tailor itself to the line items rather than assume a machine sale.
 */
export function deriveAgreementSections(snapshot: SnapshotLine[]): AgreementSections {
  const has = (c: ItemCategory) => snapshot.some((l) => l.category === c);
  return {
    include_equipment: has("equipment"),
    include_location_services: has("location_services"),
    include_shipping_storage: has("freight"),
    include_financing: has("financing"),
    coffee_supply_required: has("coffee"),
  };
}
