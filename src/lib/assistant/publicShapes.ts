/**
 * Public output shapes for every assistant tool.
 *
 * Everything the model (and therefore the customer) can see is built
 * from these explicit types. `assertPublicShape` is the final gate: it
 * walks any tool output and refuses keys that look like internal
 * economics or provider identifiers, even if a future refactor forgets
 * the allowlist.
 */
export type CatalogKind = "coffee" | "machine" | "location_service" | "commerce";

export type PriceBasis =
  | "list"          // coffee_products list price (Tier 1 / public feed)
  | "tier"          // the caller's coffee pricing tier
  | "storefront"    // enrolled storefront customer price
  | "asking"        // machine seller asking price
  | "buy_now"       // machine buy-now price
  | "tier_ladder"   // location service fee ladder (informational)
  | "catalog"       // commerce catalog_items unit price (server-read)
  | "none";

export type Availability = "in_stock" | "low_stock" | "out_of_stock" | "available" | "unavailable" | "informational";

export type PricingMode = "priced" | "requires_qualification" | "informational";

export interface CatalogItemSummary {
  kind: CatalogKind;
  product_id: string;
  name: string;
  sku: string | null;
  category: string | null;
  short_description: string | null;
  image_url: string | null;
  unit: string | null;
  min_order_qty: number | null;
  availability: Availability;
  display_price: number | null;
  price_basis: PriceBasis;
  pricing_mode: PricingMode;
  currency: "USD";
  /** Relative path on vendingconnector.com the UI may link to. */
  href: string | null;
  // ── Commerce catalog rows only (kind === "commerce") ──
  /** Stable key; the only identifier besides product_id that code may use. */
  catalog_key?: string;
  commerce_kind?: string;
  /** What the customer may do with this row, decided server-side. */
  action?: "add_to_quote" | "start_financing_application" | "request_qualification" | "auto_add_on" | "explain_only";
  notices?: string[];
  requires_agreement?: string | null;
  qualification_program?: string | null;
  add_on_parent_key?: string | null;
}

export interface CatalogItemDetail extends CatalogItemSummary {
  description: string | null;
  /** Human-readable attributes (public only). */
  attributes: Array<{ label: string; value: string }>;
  /** Extra shipping-related public fact for coffee (0 for storefront). */
  shipping_note: string | null;
}

export interface SearchCatalogOutput {
  kind: CatalogKind;
  query: string | null;
  items: CatalogItemSummary[];
  total_returned: number;
  notes: string[];
}

export interface CompareProductsOutput {
  kind: CatalogKind;
  items: CatalogItemDetail[];
  /** Attribute labels present on at least one item, in display order. */
  attribute_labels: string[];
  notes: string[];
}

export type RoleClass = "customer" | "operator" | "staff" | "partner" | "member";

export interface CustomerContextOutput {
  authenticated: boolean;
  first_name?: string | null;
  role_class?: RoleClass;
  coffee_access?: boolean;
  storefront?: { display_name: string; slug: string } | null;
  counts?: { coffee_orders: number; workflows: number; storefront_quotes: number };
}

export type PaymentStatus = "awaiting_payment" | "paid" | "cancelled" | "not_applicable" | "unknown";

export interface OrderStatusOutput {
  status: "found" | "not_found" | "authentication_required";
  record?: {
    record_type: "coffee_order" | "workflow" | "storefront_quote";
    reference: string;
    public_status: string;
    date: string;
    items: Array<{ name: string; quantity: number }>;
    total: number | null;
    tracking_number: string | null;
    payment_status: PaymentStatus;
    workflow_stage: string | null;
    stages: Array<{ label: string; status: string }>;
    href: string | null;
  };
}

/** Key fragments that must never appear anywhere in a tool output. */
export const PROHIBITED_OUTPUT_KEY_FRAGMENTS = [
  "base_price",
  "commission",
  "unit_cost",
  "wholesale",
  "est_cost",
  "margin",
  "qb_",
  "quickbooks",
  "stripe_",
  "supplier_cost",
  "payout",
  "routing",
  "account_number",
  "admin_notes",
  "private_contact",
  "contact_email",
  "contact_phone",
  "created_by",
  "operator_id",
  "customer_profile_id",
  "user_id",
  "tenant_id",
  "internal",
] as const;

export function isProhibitedKey(key: string): boolean {
  const k = key.toLowerCase();
  return PROHIBITED_OUTPUT_KEY_FRAGMENTS.some((frag) => k.includes(frag));
}

/** Depth-first key scan. Returns the first offending key path or null. */
export function findProhibitedKey(value: unknown, path = ""): string | null {
  if (Array.isArray(value)) return findInArray(value, path);
  if (!value || typeof value !== "object") return null;
  return findInObject(value as Record<string, unknown>, path);
}

function findInArray(arr: unknown[], path: string): string | null {
  for (let i = 0; i < arr.length; i += 1) {
    const hit = findProhibitedKey(arr[i], `${path}[${i}]`);
    if (hit) return hit;
  }
  return null;
}

function findInObject(obj: Record<string, unknown>, path: string): string | null {
  for (const [k, v] of Object.entries(obj)) {
    const p = path ? `${path}.${k}` : k;
    if (isProhibitedKey(k)) return p;
    const hit = findProhibitedKey(v, p);
    if (hit) return hit;
  }
  return null;
}

export class PublicShapeViolation extends Error {
  readonly keyPath: string;
  constructor(keyPath: string) {
    super(`Tool output contains a prohibited key: ${keyPath}`);
    this.name = "PublicShapeViolation";
    this.keyPath = keyPath;
  }
}

/** Throws when an output contains a prohibited key anywhere. */
export function assertPublicShape<T>(value: T): T {
  const hit = findProhibitedKey(value);
  if (hit) throw new PublicShapeViolation(hit);
  return value;
}

export function formatUsd(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "Price on request";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}
