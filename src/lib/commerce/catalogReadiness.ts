import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { APPROVED_CATALOG_KEYS, CATALOG_COLUMNS, type ApprovedCatalogKey, type CommerceCatalogItem, type CommerceKind, type RequiredAgreement, type TaxTreatment, isCheckoutReady, PAYABLE_KINDS } from "./catalog";
import type { QuickBooksItemSummary } from "./quickbooksAdapter";

/**
 * Administrator-only catalog readiness. Covers all twelve approved records
 * whether or not the row exists yet, compares the live price with the
 * approved price, and explains exactly why a row is or is not ready for a
 * Vinnie checkout. Served only behind the admin gate; the customer
 * projection (toPublicCatalogItem) never carries any of this.
 */
export interface ApprovedCatalogRecord {
  key: ApprovedCatalogKey;
  name: string;
  sku: string | null;
  price: number;
  kind: CommerceKind;
  agreement: RequiredAgreement | null;
  parent: ApprovedCatalogKey | null;
}

export const APPROVED_CATALOG: readonly ApprovedCatalogRecord[] = [
  { key: "financing-10-10-10", name: "10/10/10 Financing", sku: null, price: 0, kind: "application_required", agreement: null, parent: null },
  { key: "coffee-machine-freight", name: "Coffee Machine Freight", sku: null, price: 99.99, kind: "conditional_add_on", agreement: null, parent: "flavia-c600-brewer" },
  { key: "financing-standard", name: "Financing", sku: null, price: 0, kind: "application_required", agreement: null, parent: null },
  { key: "flavia-c600-brewer", name: "Flavia C600 Brewer", sku: "c6000101", price: 0, kind: "agreement_required", agreement: "coffee_supply", parent: null },
  { key: "location-service-10-10-10", name: "Location Services 10/10/10", sku: "LS101010", price: 400, kind: "qualification_required", agreement: null, parent: null },
  { key: "location-service-deposit", name: "Location Services Deposit", sku: "LS100", price: 100, kind: "deposit_only", agreement: null, parent: null },
  { key: "location-service-tier-1", name: "Location Services Tier 1", sku: "101010", price: 500, kind: "qualification_required", agreement: null, parent: null },
  { key: "location-service-tier-2", name: "Location Services Tier 2", sku: "1010102", price: 800, kind: "qualification_required", agreement: null, parent: null },
  { key: "location-service-tier-3", name: "Location Services Tier 3", sku: "1010103", price: 1200, kind: "qualification_required", agreement: null, parent: null },
  { key: "vendera-ai-cooler", name: "VendEra AI Cooler", sku: "V000111", price: 3700, kind: "agreement_required", agreement: "machine_purchase", parent: null },
  { key: "vending-machine-freight", name: "Vending Machine Freight", sku: null, price: 500, kind: "conditional_add_on", agreement: null, parent: "vendera-ai-cooler" },
  { key: "website-creation", name: "Website Creation", sku: "WS0001", price: 500, kind: "direct_checkout", agreement: null, parent: null },
];

const BEHAVIOR: Record<CommerceKind, string> = {
  direct_checkout: "Direct checkout",
  deposit_only: "Deposit via location request; never invoiced by Vinnie",
  qualification_required: "Requires recorded staff determination",
  application_required: "Financing application; never a charge",
  agreement_required: "Requires signed agreement",
  informational_only: "Information only",
  conditional_add_on: "Auto add-on synced to parent quantity",
};

export interface ReadinessRow {
  catalog_key: ApprovedCatalogKey;
  name: string;
  exists: boolean;
  active: boolean;
  actual_price: number | null;
  approved_price: number;
  price_matches: boolean;
  behavior: string;
  commerce_kind: CommerceKind;
  agreement_requirement: RequiredAgreement | null;
  freight_relationship: { role: "add_on"; parent_key: string } | { role: "parent"; add_on_keys: string[] } | null;
  payable: boolean;
  qb_item_id: string | null;
  qb_mapping_present: boolean;
  tax_treatment: TaxTreatment | null;
  tax_treatment_present: boolean;
  ready: boolean;
  reason: string;
}

function freightRelationship(record: ApprovedCatalogRecord): ReadinessRow["freight_relationship"] {
  if (record.parent) return { role: "add_on", parent_key: record.parent };
  const addOns = APPROVED_CATALOG.filter((a) => a.parent === record.key).map((a) => a.key);
  return addOns.length > 0 ? { role: "parent", add_on_keys: addOns } : null;
}

function readinessReason(record: ApprovedCatalogRecord, row: CommerceCatalogItem | null): { ready: boolean; reason: string } {
  if (!row) return { ready: false, reason: "Row missing: apply the catalog migration seed." };
  if (!PAYABLE_KINDS.has(row.commerce_kind)) return { ready: true, reason: "Never invoiced by Vinnie; no mapping needed." };
  const problems: string[] = [];
  if (!row.active) problems.push("inactive");
  if (Number(row.unit_price) !== record.price) problems.push(`price ${Number(row.unit_price)} differs from approved ${record.price}`);
  const { missing } = isCheckoutReady(row);
  if (missing.includes("qb_item_id")) problems.push("QuickBooks Item mapping missing");
  if (missing.includes("tax_treatment")) problems.push("tax treatment unset");
  if (problems.length === 0) return { ready: true, reason: "Ready for Vinnie checkout." };
  return { ready: false, reason: `Not ready: ${problems.join("; ")}.` };
}

function mappingFields(row: CommerceCatalogItem | null): Pick<ReadinessRow, "qb_item_id" | "qb_mapping_present" | "tax_treatment" | "tax_treatment_present"> {
  return {
    qb_item_id: row?.qb_item_id ?? null,
    qb_mapping_present: !!row?.qb_item_id,
    tax_treatment: row?.tax_treatment ?? null,
    tax_treatment_present: !!row && row.tax_treatment !== "unset",
  };
}

function priceFields(record: ApprovedCatalogRecord, row: CommerceCatalogItem | null): Pick<ReadinessRow, "actual_price" | "approved_price" | "price_matches"> {
  const actual = row ? Number(row.unit_price) : null;
  return { actual_price: actual, approved_price: record.price, price_matches: actual === record.price };
}

export function buildReadinessRow(record: ApprovedCatalogRecord, row: CommerceCatalogItem | null): ReadinessRow {
  const kind = row?.commerce_kind ?? record.kind;
  return {
    catalog_key: record.key,
    name: row?.name ?? record.name,
    exists: row !== null,
    active: row?.active === true,
    ...priceFields(record, row),
    behavior: BEHAVIOR[kind],
    commerce_kind: kind,
    agreement_requirement: row?.required_agreement ?? record.agreement,
    freight_relationship: freightRelationship(record),
    payable: PAYABLE_KINDS.has(kind),
    ...mappingFields(row),
    ...readinessReason(record, row),
  };
}

/** Every keyed row, active or not (admin diagnostics only). */
export async function loadKeyedCatalog(): Promise<CommerceCatalogItem[]> {
  const { data, error } = await supabaseAdmin.from("catalog_items").select(CATALOG_COLUMNS).not("catalog_key", "is", null);
  if (error) throw new Error(`catalog read failed: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({ ...(r as unknown as CommerceCatalogItem), unit_price: Number(r.unit_price), active: r.active === true }));
}

export interface ReadinessReport {
  rows: ReadinessRow[];
  total: number;
  ready: number;
  not_ready: number;
}

/** All twelve approved records, in approved order, whatever the table holds. */
export function buildReadinessReport(rows: CommerceCatalogItem[]): ReadinessReport {
  const byKey = new Map(rows.filter((r) => r.catalog_key).map((r) => [r.catalog_key, r]));
  const report = APPROVED_CATALOG.map((record) => buildReadinessRow(record, byKey.get(record.key) ?? null));
  return { rows: report, total: APPROVED_CATALOG_KEYS.length, ready: report.filter((r) => r.ready).length, not_ready: report.filter((r) => !r.ready).length };
}

// ─── Mapping suggestions (never applied automatically) ─────────────────

export interface MappingSuggestion {
  catalog_key: ApprovedCatalogKey;
  qb_item_id: string;
  qb_item_name: string;
  basis: "exact_sku" | "normalized_name";
}

export const normalizeName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Exact SKU (case-insensitive) first, then exact normalized name. One
 * suggestion per key at most, only for active Items, and only when the
 * match is unique. An administrator must confirm every mapping.
 */
function uniqueMatch(row: CommerceCatalogItem, active: QuickBooksItemSummary[]): { item: QuickBooksItemSummary; basis: MappingSuggestion["basis"] } | null {
  const sku = row.sku?.trim().toLowerCase();
  const bySku = sku ? active.filter((i) => i.sku?.trim().toLowerCase() === sku) : [];
  if (bySku.length === 1) return { item: bySku[0], basis: "exact_sku" };
  if (bySku.length > 1) return null;
  const byName = active.filter((i) => normalizeName(i.name) === normalizeName(row.name));
  return byName.length === 1 ? { item: byName[0], basis: "normalized_name" } : null;
}

export function suggestMappings(rows: CommerceCatalogItem[], items: QuickBooksItemSummary[]): MappingSuggestion[] {
  const active = items.filter((i) => i.active);
  const out: MappingSuggestion[] = [];
  for (const record of APPROVED_CATALOG) {
    const row = rows.find((r) => r.catalog_key === record.key);
    if (!row || !PAYABLE_KINDS.has(row.commerce_kind)) continue;
    const pick = uniqueMatch(row, active);
    if (pick) out.push({ catalog_key: record.key, qb_item_id: pick.item.id, qb_item_name: pick.item.name, basis: pick.basis });
  }
  return out;
}
