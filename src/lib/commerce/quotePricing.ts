import type { CommerceCatalogItem } from "./catalog";
import { addOnsFor } from "./catalog";
import type { ResolvedPricing } from "@/lib/coffeePricing";
import { MAX_LINE_QUANTITY, MAX_QUOTE_LINES, QuoteError, type LinePricingBasis, type LineValidationStatus, type QuoteChange, type QuoteLineRow } from "./quoteTypes";

/**
 * Pure quote arithmetic. No database access: callers pass the catalog,
 * the coffee product rows, and the resolver's pricing map, and receive
 * repriced line drafts plus the list of changes versus the previous
 * snapshot. Every number here is server-derived.
 */
export interface CoffeeProductRow {
  id: string;
  name: string;
  sku: string | null;
  active: boolean;
  stock_status: string | null;
  hidden?: boolean;
}

export type LineIdentity = `catalog:${string}` | `coffee:${string}`;

export interface LineDraft {
  identity: LineIdentity;
  source_type: "catalog_item" | "coffee_product";
  catalog_item_id: string | null;
  coffee_product_id: string | null;
  catalog_key: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  pricing_basis: LinePricingBasis;
  parent_identity: LineIdentity | null;
  is_auto_add_on: boolean;
  validation_status: LineValidationStatus;
  staff_determination_by: string | null;
  staff_determination_at: string | null;
  staff_determination_note: string | null;
}

export interface QuoteOperation {
  op: "add" | "remove" | "set_quantity";
  /** catalog_key, catalog_items.id, or coffee_products.id */
  ref: string;
  quantity: number | null;
}

export interface PricingInputs {
  catalog: CommerceCatalogItem[];
  coffee: Map<string, CoffeeProductRow>;
  coffeePricing: Map<string, ResolvedPricing>;
  viewer: { userId: string; storefront: boolean };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function assertQuantity(q: unknown): number {
  if (typeof q !== "number" || !Number.isInteger(q) || q < 1 || q > MAX_LINE_QUANTITY) {
    throw new QuoteError("quantity_invalid", `Quantity must be a whole number between 1 and ${MAX_LINE_QUANTITY}.`);
  }
  return q;
}

/** Kinds a customer may place on a quote themselves. */
const QUOTABLE_KINDS = new Set(["direct_checkout", "deposit_only", "agreement_required", "qualification_required"]);

export function assertQuotable(item: CommerceCatalogItem): void {
  if (!item.active) throw new QuoteError("item_not_quotable", `${item.name} is not currently available.`, { catalog_key: item.catalog_key, reason: "inactive" });
  if (item.commerce_kind === "application_required") {
    throw new QuoteError("item_not_quotable", `${item.name} is an application, not a purchase. Record financing interest on the quote instead; it never adds a charge.`, { catalog_key: item.catalog_key, reason: "application_required" });
  }
  if (!QUOTABLE_KINDS.has(item.commerce_kind)) {
    throw new QuoteError("item_not_quotable", `${item.name} cannot be added to a quote directly.`, { catalog_key: item.catalog_key, reason: item.commerce_kind });
  }
}

function catalogBasis(item: CommerceCatalogItem): LinePricingBasis {
  if (item.pricing_basis === "no_charge") return "no_charge";
  return item.pricing_basis === "per_location" ? "catalog_per_location" : "catalog_fixed";
}

function catalogValidation(item: CommerceCatalogItem, staffDeterminedAt: string | null): LineValidationStatus {
  if (!item.active) return "inactive";
  if (item.commerce_kind === "deposit_only") return "location_intake";
  if (item.commerce_kind === "qualification_required" && !staffDeterminedAt) return "requires_qualification";
  return "valid";
}

interface Prior {
  quantity: number;
  staff_determination_by: string | null;
  staff_determination_at: string | null;
  staff_determination_note: string | null;
}

type StaffFields = Pick<LineDraft, "staff_determination_by" | "staff_determination_at" | "staff_determination_note">;

function staffFields(prior: Prior | null): StaffFields {
  return {
    staff_determination_by: prior?.staff_determination_by ?? null,
    staff_determination_at: prior?.staff_determination_at ?? null,
    staff_determination_note: prior?.staff_determination_note ?? null,
  };
}

export function catalogDraft(item: CommerceCatalogItem, quantity: number, prior: Prior | null, parent: LineIdentity | null): LineDraft {
  const unit = item.pricing_basis === "no_charge" ? 0 : round2(item.unit_price);
  const staff = staffFields(prior);
  return {
    identity: `catalog:${item.id}`,
    source_type: "catalog_item",
    catalog_item_id: item.id,
    coffee_product_id: null,
    catalog_key: item.catalog_key,
    description: item.name,
    quantity,
    unit_price: unit,
    line_total: round2(unit * quantity),
    pricing_basis: catalogBasis(item),
    parent_identity: parent,
    is_auto_add_on: parent !== null,
    validation_status: catalogValidation(item, staff.staff_determination_at),
    ...staff,
  };
}

function coffeeBasis(resolved: ResolvedPricing | undefined, viewer: PricingInputs["viewer"]): { unit: number; basis: LinePricingBasis } {
  if (!resolved) return { unit: 0, basis: "coffee_list" };
  if (resolved.storefront && !resolved.storefront.error) return { unit: round2(resolved.price), basis: "coffee_storefront" };
  if (viewer.userId && !resolved.fallback_used) return { unit: round2(resolved.price), basis: "coffee_tier" };
  return { unit: round2(resolved.price), basis: "coffee_list" };
}

function coffeeValidation(row: CoffeeProductRow, resolved: ResolvedPricing | undefined): LineValidationStatus {
  if (!row.active || row.hidden) return "inactive";
  if (row.stock_status === "out_of_stock" || !resolved || resolved.fallback_reason === "product-not-found") return "unavailable";
  return "valid";
}

export function coffeeDraft(row: CoffeeProductRow, quantity: number, inputs: PricingInputs, prior: Prior | null): LineDraft {
  const resolved = inputs.coffeePricing.get(row.id);
  const { unit, basis } = coffeeBasis(resolved, inputs.viewer);
  return {
    identity: `coffee:${row.id}`,
    source_type: "coffee_product",
    catalog_item_id: null,
    coffee_product_id: row.id,
    catalog_key: null,
    description: row.name,
    quantity,
    unit_price: unit,
    line_total: round2(unit * quantity),
    pricing_basis: basis,
    parent_identity: null,
    is_auto_add_on: false,
    validation_status: coffeeValidation(row, resolved),
    ...staffFields(prior),
  };
}

/** Add-on lines (freight) follow their parent's quantity exactly; orphans vanish. */
export function withAddOns(manual: LineDraft[], catalog: CommerceCatalogItem[]): LineDraft[] {
  const out: LineDraft[] = [];
  for (const line of manual) {
    out.push(line);
    if (!line.catalog_key) continue;
    for (const addOn of addOnsFor(line.catalog_key, catalog)) {
      out.push(catalogDraft(addOn, line.quantity, null, line.identity));
    }
  }
  return out;
}

/** An approved 10/10/10 line waives the ordinary per-location deposit. */
export function applyDepositWaiver(lines: LineDraft[], catalog: CommerceCatalogItem[]): { lines: LineDraft[]; waived: LineDraft[] } {
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const approvedTenTenTen = lines.some((l) => l.catalog_item_id && byId.get(l.catalog_item_id)?.qualification_program === "ten_ten_ten" && l.staff_determination_at);
  if (!approvedTenTenTen) return { lines, waived: [] };
  const waived = lines.filter((l) => l.catalog_item_id && byId.get(l.catalog_item_id)?.commerce_kind === "deposit_only");
  return { lines: lines.filter((l) => !waived.includes(l)), waived };
}

export function totals(lines: LineDraft[]): { subtotal: number; total: number } {
  const subtotal = round2(lines.reduce((n, l) => n + l.line_total, 0));
  return { subtotal, total: subtotal }; // pre-tax; tax is decided on the QuickBooks invoice
}

export function assertLineCount(lines: LineDraft[]): void {
  if (lines.length > MAX_QUOTE_LINES) throw new QuoteError("invalid_operation", `A quote may hold at most ${MAX_QUOTE_LINES} lines.`);
}

const identityOf = (l: QuoteLineRow): LineIdentity => (l.source_type === "catalog_item" ? `catalog:${l.catalog_item_id}` : `coffee:${l.coffee_product_id}`);

/** Public facts about one surviving line that differ from its snapshot. */
function lineChanges(prev: QuoteLineRow, cur: LineDraft): QuoteChange[] {
  const out: QuoteChange[] = [];
  const prevPrice = Number(prev.unit_price);
  if (cur.unit_price !== prevPrice) out.push({ kind: "price_changed", description: cur.description, previous: prevPrice, current: cur.unit_price });
  for (const kind of ["inactive", "unavailable"] as const) {
    if (cur.validation_status === kind && prev.validation_status !== kind) out.push({ kind, description: cur.description, previous: prevPrice, current: null });
  }
  if (cur.is_auto_add_on && cur.quantity !== prev.quantity) out.push({ kind: "add_on_adjusted", description: cur.description, previous: prev.quantity, current: cur.quantity });
  return out;
}

/** Changes a customer must see and re-confirm: only public price/availability facts. */
export function diffLines(previous: QuoteLineRow[], next: LineDraft[], waived: LineDraft[]): QuoteChange[] {
  const nextById = new Map(next.map((l) => [l.identity, l]));
  const waivedIds = new Set(waived.map((w) => w.identity));
  return previous.flatMap((prev) => {
    const cur = nextById.get(identityOf(prev));
    if (cur) return lineChanges(prev, cur);
    return waivedIds.has(identityOf(prev)) ? [{ kind: "deposit_waived" as const, description: prev.description, previous: prev.line_total, current: 0 }] : [];
  });
}

export function lineIdentity(line: QuoteLineRow): LineIdentity {
  return identityOf(line);
}
