import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Canonical commerce catalog projection.
 *
 * `catalog_items` is the single source of truth for Vinnie's sellable and
 * explainable offerings. Rows are addressed by immutable `id` or by the
 * stable `catalog_key` — never by name or SKU. Prices, active status,
 * QuickBooks mapping, tax treatment, agreement and qualification rules all
 * come from the row; the model never supplies or overrides any of them.
 *
 * Two shapes leave this module:
 *   - CommerceCatalogItem: the server-side row (includes qb_item_id and
 *     tax_treatment) for pricing/checkout code only.
 *   - PublicCatalogItem: the allowlisted customer/model-facing projection.
 */
export const COMMERCE_KINDS = [
  "direct_checkout",
  "deposit_only",
  "qualification_required",
  "application_required",
  "agreement_required",
  "informational_only",
  "conditional_add_on",
] as const;
export type CommerceKind = (typeof COMMERCE_KINDS)[number];

export type PricingBasis = "fixed_unit" | "per_location" | "no_charge";
export type TaxTreatment = "unset" | "qbo_automated" | "exempt";
export type RequiredAgreement = "coffee_supply" | "machine_purchase";
export type QualificationProgram = "location_tier" | "ten_ten_ten";
export type FinancingProgram = "standard" | "ten_ten_ten";
export type EquipmentOwnership = "sold" | "company_owned_loan";

export interface CommerceCatalogItem {
  id: string;
  catalog_key: string;
  name: string;
  description: string | null;
  item_type: string | null;
  unit_price: number;
  sku: string | null;
  active: boolean;
  commerce_kind: CommerceKind;
  pricing_basis: PricingBasis;
  tax_treatment: TaxTreatment;
  required_agreement: RequiredAgreement | null;
  qualification_program: QualificationProgram | null;
  financing_program: FinancingProgram | null;
  add_on_parent_key: string | null;
  equipment_ownership: EquipmentOwnership | null;
  /** Server-only. Never placed in tool output or UI blocks. */
  qb_item_id: string | null;
}

export const CATALOG_COLUMNS =
  "id, catalog_key, name, description, item_type, unit_price, sku, active, commerce_kind, pricing_basis, tax_treatment, required_agreement, qualification_program, financing_program, add_on_parent_key, equipment_ownership, qb_item_id";

/** The twelve approved keys (migration 20260907221651). */
export const APPROVED_CATALOG_KEYS = [
  "financing-10-10-10",
  "coffee-machine-freight",
  "financing-standard",
  "flavia-c600-brewer",
  "location-service-10-10-10",
  "location-service-deposit",
  "location-service-tier-1",
  "location-service-tier-2",
  "location-service-tier-3",
  "vendera-ai-cooler",
  "vending-machine-freight",
  "website-creation",
] as const;
export type ApprovedCatalogKey = (typeof APPROVED_CATALOG_KEYS)[number];

/** What the customer can do with a row, derived only from server metadata. */
export type CatalogAction =
  | "add_to_quote"
  | "start_financing_application"
  | "request_qualification"
  | "auto_add_on"
  | "explain_only";

export interface PublicCatalogItem {
  kind: "commerce";
  product_id: string;
  catalog_key: string;
  name: string;
  sku: string | null;
  category: string | null;
  short_description: string | null;
  image_url: null;
  unit: string;
  min_order_qty: number;
  availability: "available";
  /** Catalog unit price; null when the row carries no catalog charge. */
  display_price: number | null;
  price_basis: "catalog";
  pricing_mode: "priced" | "requires_qualification" | "informational";
  currency: "USD";
  href: string | null;
  commerce_kind: CommerceKind;
  action: CatalogAction;
  notices: string[];
  requires_agreement: RequiredAgreement | null;
  qualification_program: QualificationProgram | null;
  add_on_parent_key: string | null;
}

const ITEM_TYPE_LABEL: Record<string, string> = {
  financing: "Financing",
  coffee_program: "Coffee Program",
  location_services: "Location Services",
  vendera_ai_cooler: "Equipment",
  machine_sale: "Equipment",
  combo_machine: "Equipment",
  freight: "Freight",
  other: "Services",
};

const ACTION_BY_KIND: Record<CommerceKind, CatalogAction> = {
  direct_checkout: "add_to_quote",
  deposit_only: "add_to_quote",
  agreement_required: "add_to_quote",
  qualification_required: "request_qualification",
  application_required: "start_financing_application",
  conditional_add_on: "auto_add_on",
  informational_only: "explain_only",
};

const HREF_BY_KIND: Partial<Record<CommerceKind, string>> = {
  application_required: "/financing",
  deposit_only: "/request-location",
  qualification_required: "/request-location",
};

type NoticeInput = Pick<CommerceCatalogItem, "commerce_kind" | "equipment_ownership" | "qualification_program" | "add_on_parent_key" | "required_agreement" | "pricing_basis" | "unit_price">;

/** Every customer-facing rule statement, derived from server metadata only. */
const NOTICE_RULES: Array<[(i: NoticeInput) => boolean, (i: NoticeInput) => string]> = [
  [(i) => i.commerce_kind === "application_required", () => "$0.00 means there is no catalog charge to start an application. Financing is not free, and approval, terms, and rates are never guaranteed."],
  [(i) => i.equipment_ownership === "company_owned_loan", () => "Provided on loan to qualifying operators under the Equipment Loan and Beverage Supply Agreement. Ownership does not transfer, and this item cannot be checked out on its own."],
  [(i) => i.required_agreement === "machine_purchase", () => "Requires the machine purchase agreement before checkout."],
  [(i) => i.qualification_program === "location_tier", () => "The location team determines the applicable tier; Vinnie cannot select or check out a tier."],
  [(i) => i.qualification_program === "ten_ten_ten", () => "Requires recorded 10/10/10 qualification; not a standalone or universally available rate."],
  [(i) => i.commerce_kind === "conditional_add_on" && !!i.add_on_parent_key, (i) => `Added automatically, one per unit of ${(i.add_on_parent_key ?? "").replace(/-/g, " ")}.`],
  [(i) => i.pricing_basis === "per_location", (i) => `$${i.unit_price.toFixed(2)} per requested location, following the existing location-request process.`],
];

export function catalogNotices(item: NoticeInput): string[] {
  return NOTICE_RULES.filter(([when]) => when(item)).map(([, text]) => text(item));
}

function pricingMode(item: CommerceCatalogItem): PublicCatalogItem["pricing_mode"] {
  if (item.pricing_basis === "no_charge" || item.commerce_kind === "informational_only") return "informational";
  if (item.commerce_kind === "qualification_required") return "requires_qualification";
  return "priced";
}

/** Allowlisted projection: no qb_item_id, no tax treatment, no internals. */
export function toPublicCatalogItem(item: CommerceCatalogItem): PublicCatalogItem {
  return {
    kind: "commerce",
    product_id: item.id,
    catalog_key: item.catalog_key,
    name: item.name,
    sku: item.sku,
    category: ITEM_TYPE_LABEL[item.item_type ?? "other"] ?? "Services",
    short_description: item.description ? item.description.slice(0, 240) : null,
    image_url: null,
    unit: item.pricing_basis === "per_location" ? "per location" : "each",
    min_order_qty: 1,
    availability: "available",
    display_price: item.pricing_basis === "no_charge" ? null : Number(item.unit_price),
    price_basis: "catalog",
    pricing_mode: pricingMode(item),
    currency: "USD",
    href: HREF_BY_KIND[item.commerce_kind] ?? null,
    commerce_kind: item.commerce_kind,
    action: ACTION_BY_KIND[item.commerce_kind],
    notices: catalogNotices(item),
    requires_agreement: item.required_agreement,
    qualification_program: item.qualification_program,
    add_on_parent_key: item.add_on_parent_key,
  };
}

function normalize(row: Record<string, unknown>): CommerceCatalogItem {
  return { ...(row as unknown as CommerceCatalogItem), unit_price: Number(row.unit_price), active: row.active === true };
}

/** Active, keyed rows in name order. Rows without a catalog_key are admin-only price-book entries and stay invisible to Vinnie. */
export async function loadActiveCatalog(): Promise<CommerceCatalogItem[]> {
  const { data, error } = await supabaseAdmin
    .from("catalog_items")
    .select(CATALOG_COLUMNS)
    .eq("active", true)
    .not("catalog_key", "is", null)
    .order("name", { ascending: true });
  if (error) throw new Error(`commerce catalog read failed: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(normalize);
}

/** One row by id or catalog_key, active or not (callers decide what inactive means). */
export async function getCatalogItem(ref: string): Promise<CommerceCatalogItem | null> {
  const column = /^[0-9a-f-]{36}$/i.test(ref) ? "id" : "catalog_key";
  const { data, error } = await supabaseAdmin.from("catalog_items").select(CATALOG_COLUMNS).eq(column, ref).maybeSingle();
  if (error) throw new Error(`commerce catalog read failed: ${error.message}`);
  return data ? normalize(data as Record<string, unknown>) : null;
}

/** Add-on rows whose parent is the given key (active only). */
export function addOnsFor(parentKey: string, catalog: CommerceCatalogItem[]): CommerceCatalogItem[] {
  return catalog.filter((c) => c.commerce_kind === "conditional_add_on" && c.add_on_parent_key === parentKey && c.active);
}

/** True when a payable line of this item can be invoiced: mapped Item and a decided tax treatment. */
export function isCheckoutReady(item: CommerceCatalogItem): { ready: boolean; missing: Array<"qb_item_id" | "tax_treatment"> } {
  const missing: Array<"qb_item_id" | "tax_treatment"> = [];
  if (!item.qb_item_id) missing.push("qb_item_id");
  if (item.tax_treatment === "unset") missing.push("tax_treatment");
  return { ready: missing.length === 0, missing };
}

/** Kinds that can ever produce a payable QuickBooks line. */
export const PAYABLE_KINDS: ReadonlySet<CommerceKind> = new Set(["direct_checkout", "agreement_required", "conditional_add_on", "qualification_required"]);
