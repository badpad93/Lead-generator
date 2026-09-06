import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveCoffeeProductsPricing, type ResolvedPricing, type StorefrontContext } from "@/lib/coffeePricing";
import { getHiddenProductIds } from "@/lib/storefront/visibility";
import { pickPublicMachineListing, PUBLIC_MACHINE_LISTING_COLUMNS } from "@/lib/machineListings/publicShape";
import { TIER_PRICES, TEN_TEN_TEN_PRICE } from "@/lib/pricing/locationPricing";
import {
  assertPublicShape,
  type Availability,
  type CatalogItemDetail,
  type CatalogItemSummary,
  type CatalogKind,
  type PriceBasis,
} from "./publicShapes";

/**
 * Catalog reads for the assistant. Every price comes from the same
 * server resolvers the storefront uses; every row is reduced to an
 * explicit public shape before it leaves this module.
 */
export interface CatalogViewer {
  userId: string | null;
  /** Set only for an enrolled customer of an APPROVED storefront tenant. */
  storefront: StorefrontContext | null;
}

export interface CatalogQuery {
  query: string | null;
  categorySlug: string | null;
  limit: number;
}

export const LOCATION_DEPOSIT_PER_LOCATION = 100;

// ─── Coffee ────────────────────────────────────────────────────────

const COFFEE_COLUMNS =
  "id, name, sku, description, image_url, unit, min_order_qty, pack_quantity, stock_status, active, category_id, coffee_categories!coffee_products_category_id_fkey(name, slug)";

interface CoffeeRow {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  image_url: string | null;
  unit: string | null;
  min_order_qty: number | null;
  pack_quantity: number | null;
  stock_status: string | null;
  active: boolean;
  category_id: string | null;
  coffee_categories: { name: string; slug: string } | { name: string; slug: string }[] | null;
}

function sanitizeSearch(q: string | null): string | null {
  if (!q) return null;
  const cleaned = q.replace(/[%,.*()]/g, "").trim().slice(0, 80);
  return cleaned || null;
}

function coffeeAvailability(stock: string | null): Availability {
  if (stock === "out_of_stock") return "out_of_stock";
  if (stock === "low_stock") return "low_stock";
  return "in_stock";
}

function categoryName(row: CoffeeRow): string | null {
  const c = Array.isArray(row.coffee_categories) ? row.coffee_categories[0] : row.coffee_categories;
  return c?.name ?? null;
}

async function categoryProductIds(slug: string): Promise<string[] | null> {
  const { data: cat } = await supabaseAdmin.from("coffee_categories").select("id").eq("slug", slug).maybeSingle();
  if (!cat) return [];
  const { data: links, error } = await supabaseAdmin
    .from("coffee_product_categories")
    .select("product_id")
    .eq("category_id", cat.id);
  if (error || !links || links.length === 0) return null; // fall back to primary category filter
  return (links as Array<{ product_id: string }>).map((l) => l.product_id);
}

type CategoryScope = { kind: "none" } | { kind: "ids"; ids: string[] } | { kind: "primary"; categoryId: string };

/** Resolve a category slug to a product-id scope, falling back to the legacy primary category. */
async function categoryScope(slug: string): Promise<CategoryScope> {
  const { data: cat } = await supabaseAdmin.from("coffee_categories").select("id").eq("slug", slug).maybeSingle();
  if (!cat) return { kind: "none" };
  const linked = await categoryProductIds(slug);
  if (linked && linked.length === 0) return { kind: "none" };
  if (linked) return { kind: "ids", ids: linked };
  return { kind: "primary", categoryId: cat.id as string };
}

async function fetchCoffeeRows(q: CatalogQuery, ids?: string[]): Promise<CoffeeRow[]> {
  let query = supabaseAdmin
    .from("coffee_products")
    .select(COFFEE_COLUMNS)
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (ids) query = query.in("id", ids);
  if (q.categorySlug) {
    const scope = await categoryScope(q.categorySlug);
    if (scope.kind === "none") return [];
    query = scope.kind === "ids" ? query.in("id", scope.ids) : query.eq("category_id", scope.categoryId);
  }
  const s = sanitizeSearch(q.query);
  if (s) query = query.or(`name.ilike.%${s}%,description.ilike.%${s}%,sku.ilike.%${s}%`);
  const { data, error } = await query.limit(Math.max(q.limit * 2, 10));
  if (error) throw new Error(`coffee catalog read failed: ${error.message}`);
  return (data ?? []) as unknown as CoffeeRow[];
}

function coffeePrice(resolved: ResolvedPricing | undefined, viewer: CatalogViewer): { price: number | null; basis: PriceBasis } {
  if (!resolved || resolved.fallback_reason === "product-not-found") return { price: null, basis: "none" };
  if (resolved.storefront) {
    if (resolved.storefront.error) return { price: null, basis: "none" };
    return { price: resolved.price, basis: "storefront" };
  }
  if (viewer.userId && !resolved.fallback_used) return { price: resolved.price, basis: "tier" };
  return { price: resolved.price, basis: "list" };
}

function coffeeSummary(row: CoffeeRow, resolved: ResolvedPricing | undefined, viewer: CatalogViewer): CatalogItemSummary {
  const { price, basis } = coffeePrice(resolved, viewer);
  return {
    kind: "coffee",
    product_id: row.id,
    name: row.name,
    sku: row.sku,
    category: categoryName(row),
    short_description: row.description ? row.description.slice(0, 200) : null,
    image_url: row.image_url,
    unit: row.unit,
    min_order_qty: row.min_order_qty,
    availability: coffeeAvailability(row.stock_status),
    display_price: price,
    price_basis: basis,
    pricing_mode: price === null ? "informational" : "priced",
    currency: "USD",
    href: "/coffee",
  };
}

function coffeeDetail(row: CoffeeRow, resolved: ResolvedPricing | undefined, viewer: CatalogViewer): CatalogItemDetail {
  const summary = coffeeSummary(row, resolved, viewer);
  const candidates: Array<[string, unknown]> = [
    ["Unit", row.unit],
    ["Pack quantity", row.pack_quantity],
    ["Minimum order quantity", row.min_order_qty],
    ["Category", summary.category],
    ["Availability", summary.availability.replace(/_/g, " ")],
  ];
  const attributes = candidates.flatMap(([label, v]) => (v ? [{ label, value: String(v) }] : []));
  return { ...summary, description: row.description, attributes, shipping_note: shippingNote(resolved?.shipping_cost ?? 0, !!viewer.storefront) };
}

function shippingNote(shipPerUnit: number, isStorefront: boolean): string | null {
  if (isStorefront) return "Shipping is included for storefront customers.";
  if (shipPerUnit > 0) return `Shipping is estimated at $${shipPerUnit.toFixed(2)} per unit at checkout.`;
  return null;
}

async function filterHidden(rows: CoffeeRow[], viewer: CatalogViewer): Promise<CoffeeRow[]> {
  if (!viewer.storefront) return rows;
  const hidden = await getHiddenProductIds(viewer.storefront.tenantId);
  return rows.filter((r) => !hidden.has(r.id));
}

async function priceCoffee(rows: CoffeeRow[], viewer: CatalogViewer): Promise<Map<string, ResolvedPricing>> {
  return resolveCoffeeProductsPricing({
    productIds: rows.map((r) => r.id),
    userId: viewer.userId,
    storefront: viewer.storefront,
  });
}

export async function searchCoffee(q: CatalogQuery, viewer: CatalogViewer): Promise<CatalogItemSummary[]> {
  const rows = (await filterHidden(await fetchCoffeeRows(q), viewer)).slice(0, q.limit);
  const priced = await priceCoffee(rows, viewer);
  return rows.map((r) => assertPublicShape(coffeeSummary(r, priced.get(r.id), viewer)));
}

export async function coffeeDetails(ids: string[], viewer: CatalogViewer): Promise<CatalogItemDetail[]> {
  const rows = await filterHidden(await fetchCoffeeRows({ query: null, categorySlug: null, limit: ids.length }, ids), viewer);
  const priced = await priceCoffee(rows, viewer);
  return rows.map((r) => assertPublicShape(coffeeDetail(r, priced.get(r.id), viewer)));
}

// ─── Machines ──────────────────────────────────────────────────────

type MachineRow = Record<string, unknown>;

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}
function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function machinePrice(pub: MachineRow): { price: number | null; basis: PriceBasis } {
  const buyNow = num(pub.buy_now_price);
  if (pub.buy_now_enabled === true && buyNow !== null) return { price: buyNow / 100, basis: "buy_now" };
  const asking = num(pub.asking_price);
  if (asking !== null) return { price: asking, basis: "asking" };
  return { price: null, basis: "none" };
}

function machineName(pub: MachineRow): string {
  const title = str(pub.title);
  if (title) return title;
  return [str(pub.machine_make), str(pub.machine_model)].filter(Boolean).join(" ") || "Vending machine";
}

function machineImage(pub: MachineRow): string | null {
  const photos = Array.isArray(pub.photos) ? (pub.photos as unknown[]) : [];
  return str(pub.image_medium_url) ?? str(pub.image_thumb_url) ?? str(photos[0]);
}

function machineSummary(raw: MachineRow): CatalogItemSummary {
  const pub = pickPublicMachineListing(raw);
  const { price, basis } = machinePrice(pub);
  const qty = num(pub.quantity);
  return {
    kind: "machine",
    product_id: String(pub.id),
    name: machineName(pub),
    sku: str(pub.sku),
    category: str(pub.machine_type),
    short_description: str(pub.description)?.slice(0, 200) ?? null,
    image_url: machineImage(pub),
    unit: "each",
    min_order_qty: 1,
    availability: qty !== null && qty <= 0 ? "unavailable" : "available",
    display_price: price,
    price_basis: basis,
    pricing_mode: price === null ? "informational" : "priced",
    currency: "USD",
    href: `/machines-for-sale/${String(pub.id)}`,
  };
}

const MACHINE_ATTRS: Array<[string, string]> = [
  ["machine_make", "Make"],
  ["machine_model", "Model"],
  ["machine_year", "Year"],
  ["machine_type", "Type"],
  ["condition", "Condition"],
  ["quantity", "Quantity available"],
  ["city", "City"],
  ["state", "State"],
  ["lead_time_days", "Lead time (days)"],
  ["dimensions_text", "Dimensions"],
  ["weight_lbs", "Weight (lbs)"],
  ["electrical_requirements", "Electrical"],
  ["temperature_zone", "Temperature zone"],
  ["payment_system_compatibility", "Payment systems"],
  ["listing_warranty_summary", "Warranty"],
  ["certifications", "Certifications"],
  ["manufacturer_display_name", "Sold by"],
];

function attrText(v: unknown): string {
  if (Array.isArray(v)) return v.map(String).join(", ").trim();
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function machineDetail(raw: MachineRow): CatalogItemDetail {
  const pub = pickPublicMachineListing(raw);
  const summary = machineSummary(raw);
  const attributes = MACHINE_ATTRS.flatMap(([key, label]) => {
    const text = attrText(pub[key]);
    return text ? [{ label, value: text }] : [];
  });
  for (const [key, label] of [["includes_delivery", "Delivery included"], ["includes_install", "Installation included"], ["includes_card_reader", "Card reader included"]] as const) {
    if (pub[key] === true) attributes.push({ label, value: "Yes" });
  }
  const fee = num(pub.delivery_fee_cents);
  if (fee && fee > 0) attributes.push({ label: "Delivery fee", value: `$${(fee / 100).toFixed(2)}` });
  const msrp = num(pub.msrp_cents);
  if (msrp && msrp > 0) attributes.push({ label: "MSRP", value: `$${(msrp / 100).toFixed(2)}` });
  return { ...summary, description: str(pub.description), attributes, shipping_note: null };
}

const MACHINE_SELECT = PUBLIC_MACHINE_LISTING_COLUMNS.filter((c) => c !== "manufacturer_display_name").join(", ");

async function fetchMachineRows(q: CatalogQuery, ids?: string[]): Promise<MachineRow[]> {
  let query = supabaseAdmin
    .from("machine_listings")
    .select(MACHINE_SELECT)
    .eq("status", "active")
    .order("created_at", { ascending: false });
  if (ids) query = query.in("id", ids);
  if (q.categorySlug) query = query.ilike("machine_type", q.categorySlug);
  const s = sanitizeSearch(q.query);
  if (s) query = query.or(`title.ilike.%${s}%,description.ilike.%${s}%,machine_make.ilike.%${s}%,machine_model.ilike.%${s}%`);
  const { data, error } = await query.limit(q.limit);
  if (error) throw new Error(`machine catalog read failed: ${error.message}`);
  return (data ?? []) as unknown as MachineRow[];
}

export async function searchMachines(q: CatalogQuery): Promise<CatalogItemSummary[]> {
  const rows = await fetchMachineRows(q);
  return rows.map((r) => assertPublicShape(machineSummary(r)));
}

export async function machineDetails(ids: string[]): Promise<CatalogItemDetail[]> {
  const rows = await fetchMachineRows({ query: null, categorySlug: null, limit: ids.length }, ids);
  return rows.map((r) => assertPublicShape(machineDetail(r)));
}

// ─── Location services (informational ladder) ──────────────────────

interface LocationOffering {
  id: string;
  name: string;
  price: number;
  summary: string;
  detail: string;
}

export const LOCATION_OFFERINGS: LocationOffering[] = [
  {
    id: "location-basic",
    name: "Location placement — Basic tier",
    price: TIER_PRICES[1],
    summary: "Per-location placement fee for locations that score in the Basic tier.",
    detail:
      "Each secured location is priced by tier. The tier is set by the location's traffic (employees plus daily foot traffic), business hours, and the number of machines requested. Basic is the entry tier.",
  },
  {
    id: "location-premium",
    name: "Location placement — Premium tier",
    price: TIER_PRICES[2],
    summary: "Per-location placement fee for higher-traffic locations in the Premium tier.",
    detail:
      "Premium applies to locations whose combined traffic, hours, and machine-count score reaches the middle band.",
  },
  {
    id: "location-elite",
    name: "Location placement — Elite tier",
    price: TIER_PRICES[3],
    summary: "Per-location placement fee for the highest-traffic locations in the Elite tier.",
    detail: "Elite applies to the strongest-scoring locations, typically high traffic with extended or 24/7 hours.",
  },
  {
    id: "location-ten-ten-ten",
    name: "Location placement — 10/10/10 prepaid program (qualifying bundled pricing)",
    price: TEN_TEN_TEN_PRICE,
    summary: "Bundled program pricing for operators who qualify and prepay in full; not a standalone per-location rate.",
    detail:
      "The prepaid program replaces the tiered fee with one flat per-location price for qualifying operators, subject to availability and the governing agreements. It is not offered as a standalone location rate. The sales team confirms eligibility and terms.",
  },
];

function locationSummary(o: LocationOffering): CatalogItemSummary {
  return {
    kind: "location_service",
    product_id: o.id,
    name: o.name,
    sku: null,
    category: "Location services",
    short_description: o.summary,
    image_url: null,
    unit: "per location",
    min_order_qty: 1,
    availability: "informational",
    display_price: o.price,
    price_basis: "tier_ladder",
    pricing_mode: "requires_qualification",
    currency: "USD",
    href: "/request-location",
  };
}

function locationDetail(o: LocationOffering): CatalogItemDetail {
  return {
    ...locationSummary(o),
    description: o.detail,
    attributes: [
      { label: "Fee basis", value: "Per secured location" },
      { label: "Deposit", value: `$${LOCATION_DEPOSIT_PER_LOCATION} per location requested, credited toward the applicable placement fee` },
      { label: "Tier determined by", value: "Traffic, business hours, and machines requested; the location team determines the applicable tier" },
      { label: "Machine types", value: "Combo, AI, Water, Coffee, ATM" },
    ],
    shipping_note: null,
  };
}

function matchesQuery(o: LocationOffering, q: string | null): boolean {
  if (!q) return true;
  const hay = `${o.name} ${o.summary} ${o.detail}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).some((w) => hay.includes(w));
}

export function searchLocationServices(q: CatalogQuery): CatalogItemSummary[] {
  return LOCATION_OFFERINGS.filter((o) => matchesQuery(o, q.query))
    .slice(0, q.limit)
    .map((o) => assertPublicShape(locationSummary(o)));
}

export function locationDetails(ids: string[]): CatalogItemDetail[] {
  return LOCATION_OFFERINGS.filter((o) => ids.includes(o.id)).map((o) => assertPublicShape(locationDetail(o)));
}

// ─── Dispatch by kind ──────────────────────────────────────────────

export async function searchCatalog(kind: CatalogKind, q: CatalogQuery, viewer: CatalogViewer): Promise<CatalogItemSummary[]> {
  if (kind === "coffee") return searchCoffee(q, viewer);
  if (kind === "machine") return searchMachines(q);
  return searchLocationServices(q);
}

export async function catalogDetails(kind: CatalogKind, ids: string[], viewer: CatalogViewer): Promise<CatalogItemDetail[]> {
  if (kind === "coffee") return coffeeDetails(ids, viewer);
  if (kind === "machine") return machineDetails(ids);
  return locationDetails(ids);
}
