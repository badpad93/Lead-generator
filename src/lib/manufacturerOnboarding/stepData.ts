/**
 * Server-side allowlist for manufacturer_partners autosave writes.
 *
 * The PATCH /api/manufacturer/me endpoint filters incoming bodies
 * through this allowlist before merging into the row. Any key not
 * listed is dropped silently — same defense-in-depth pattern as
 * contractor onboarding (see 148c). New form fields require an
 * explicit add here, which forces every schema change through a
 * PR review.
 *
 * `step_data` on the row is a JSONB scratchpad for wizard-only
 * transient state (e.g. the current sub-step index within a step,
 * unsaved acknowledgment toggles). All actual company/fulfillment
 * data lives in dedicated columns and goes through the same
 * ALLOWED_TOP_LEVEL_KEYS gate.
 */

// Columns on manufacturer_partners that the wizard is allowed to
// write via autosave. Admin-only columns (admin_notes, status_reason,
// reviewed_by, suspended_by, terminated_by, current_agreement_version,
// approved_at, submitted_at, status, payout_status, dwolla_*) are
// deliberately absent — those transition via admin actions or
// server-side hooks.
export const ALLOWED_TOP_LEVEL_KEYS = new Set<string>([
  // Step 1 — Company Information
  "legal_company_name",
  "dba_or_brand",
  "entity_type",
  "website",
  "ein_tax_id",
  "year_established",
  "company_description",
  "primary_contact_name",
  "primary_contact_title",
  "primary_contact_email",
  "primary_contact_phone",
  "business_address",
  "business_city",
  "business_state",
  "business_zip",
  "business_country",
  // Step 2 — Fulfillment (allowlisted here so autosave never has to
  // be re-audited when steps 2-6 land)
  "shipping_origin_address",
  "shipping_origin_city",
  "shipping_origin_state",
  "shipping_origin_zip",
  "additional_warehouses",
  "order_acknowledgment_time_hours",
  "shipment_lead_time_days",
  "freight_process",
  "liftgate_available",
  "inside_delivery_available",
  "installation_available",
  "return_policy",
  "warranty_summary",
  "technical_contact_name",
  "technical_contact_email",
  "technical_contact_phone",
  "escalation_contact_name",
  "escalation_contact_email",
  "escalation_contact_phone",
  "inventory_update_method",
  "inventory_update_notes",
  // Wizard progress
  "current_step",
  "step_data",
]);

// Keys the wizard is allowed to write into step_data JSONB.
// Kept small on purpose — step_data is for transient wizard UI
// state, not company data. Company data goes through the top-level
// column list above.
export const ALLOWED_STEP_DATA_KEYS = new Set<string>([
  "notes_for_review",     // free-text buffer for the review step
  "step_1_complete",
  "step_2_complete",
  "step_3_complete",
  "step_4_complete",
  "step_5_complete",
]);

export function filterTopLevelKeys(
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(patch)) {
    if (ALLOWED_TOP_LEVEL_KEYS.has(k)) out[k] = patch[k];
  }
  return out;
}

export function filterStepDataKeys(
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(patch)) {
    if (ALLOWED_STEP_DATA_KEYS.has(k)) out[k] = patch[k];
  }
  return out;
}
