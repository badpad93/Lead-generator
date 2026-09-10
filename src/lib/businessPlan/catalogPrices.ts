import { getCatalogItem, type CommerceCatalogItem } from "@/lib/commerce/catalog";
import { PLAN_CATALOG_KEYS, type CatalogPriceSnapshot, type PlanCatalog } from "./packages";

/**
 * Live catalog prices for the plan. Read server-side from catalog_items by
 * the fixed keys; a missing or inactive row is reported in `missing` and
 * priced at zero, never invented. Only public fields are snapshotted (no
 * QuickBooks id, no tax treatment).
 */
export function snapshotOf(item: CommerceCatalogItem | null): CatalogPriceSnapshot | null {
  if (!item || !item.active) return null;
  return { key: item.catalog_key, name: item.name, unit_price: item.unit_price, active: true };
}

export async function loadPlanCatalog(load: (ref: string) => Promise<CommerceCatalogItem | null> = getCatalogItem): Promise<PlanCatalog> {
  const entries = await Promise.all((Object.keys(PLAN_CATALOG_KEYS) as Array<keyof typeof PLAN_CATALOG_KEYS>).map(async (slot) => [slot, snapshotOf(await load(PLAN_CATALOG_KEYS[slot]))] as const));
  const catalog = Object.fromEntries(entries) as Record<keyof typeof PLAN_CATALOG_KEYS, CatalogPriceSnapshot | null>;
  const missing = (Object.keys(PLAN_CATALOG_KEYS) as Array<keyof typeof PLAN_CATALOG_KEYS>).filter((slot) => catalog[slot] === null).map((slot) => PLAN_CATALOG_KEYS[slot]);
  return { ...catalog, missing };
}

export { catalogFromSnapshot } from "./packages";
