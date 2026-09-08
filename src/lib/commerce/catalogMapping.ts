import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { APPROVED_CATALOG_KEYS, CATALOG_COLUMNS, type ApprovedCatalogKey, type CommerceCatalogItem, type TaxTreatment } from "./catalog";
import { APPROVED_CATALOG, buildReadinessRow, type ReadinessRow } from "./catalogReadiness";

/**
 * Administrator mapping writes. Supabase only: this module never imports
 * the QuickBooks adapter and cannot create, update, or deactivate a
 * QuickBooks Item or account. Every change requires explicit confirmation
 * and records an audit_logs entry with before/after values.
 */
export interface MappingRequest {
  catalogKey: string;
  qbItemId: string | null;
  qbItemName?: string | null;
  taxTreatment: TaxTreatment;
  reason?: string | null;
  confirm: boolean;
  actorId: string;
}

export class MappingError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "MappingError";
  }
}

const QBO_ID = /^\d{1,20}$/;
const TAX: ReadonlySet<string> = new Set(["unset", "qbo_automated", "exempt"]);
export const MAPPING_AUDIT_ACTION = "commerce.catalog_mapping_updated";

function validate(req: MappingRequest): ApprovedCatalogKey {
  if (req.confirm !== true) throw new MappingError(422, "Confirmation is required to change a catalog mapping.");
  if (!(APPROVED_CATALOG_KEYS as readonly string[]).includes(req.catalogKey)) throw new MappingError(404, "Unknown catalog key.");
  if (req.qbItemId !== null && !QBO_ID.test(req.qbItemId)) throw new MappingError(422, "qb_item_id must be an existing QuickBooks Item id.");
  if (!TAX.has(req.taxTreatment)) throw new MappingError(422, "tax_treatment must be unset, qbo_automated, or exempt.");
  return req.catalogKey as ApprovedCatalogKey;
}

async function loadRow(key: string): Promise<CommerceCatalogItem> {
  const { data, error } = await supabaseAdmin.from("catalog_items").select(CATALOG_COLUMNS).eq("catalog_key", key).maybeSingle();
  if (error) throw new MappingError(502, "The catalog could not be loaded.");
  if (!data) throw new MappingError(404, "Catalog row not found. Apply the catalog migration first.");
  return { ...(data as unknown as CommerceCatalogItem), unit_price: Number(data.unit_price), active: data.active === true };
}

export async function applyCatalogMapping(req: MappingRequest): Promise<{ row: ReadinessRow; audit_id: string }> {
  const key = validate(req);
  const before = await loadRow(key);
  const after = { qb_item_id: req.qbItemId, tax_treatment: req.taxTreatment };
  const { data: updated, error } = await supabaseAdmin
    .from("catalog_items")
    .update({ ...after, updated_at: new Date().toISOString() })
    .eq("id", before.id)
    .select(CATALOG_COLUMNS)
    .single();
  if (error || !updated) throw new MappingError(502, "The mapping could not be saved.");
  const { data: audit, error: auditError } = await supabaseAdmin
    .from("audit_logs")
    .insert({
      actor_id: req.actorId,
      action: MAPPING_AUDIT_ACTION,
      entity_type: "catalog_item",
      entity_id: before.id,
      reason: req.reason?.trim() || null,
      before: { qb_item_id: before.qb_item_id, tax_treatment: before.tax_treatment },
      after,
      metadata: { catalog_key: key, qb_item_name: req.qbItemName ?? null, source: "admin_catalog_mapping" },
    })
    .select("id")
    .single();
  if (auditError || !audit) throw new MappingError(502, "The mapping was saved but the audit entry failed. Please report this.");
  const record = APPROVED_CATALOG.find((a) => a.key === key)!;
  const row = { ...(updated as unknown as CommerceCatalogItem), unit_price: Number(updated.unit_price), active: updated.active === true };
  return { row: buildReadinessRow(record, row), audit_id: String(audit.id) };
}
