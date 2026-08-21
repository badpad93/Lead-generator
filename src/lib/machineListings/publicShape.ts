/**
 * Public shape for machine_listings.
 *
 * The GET /api/machine-listings endpoint used to `SELECT *` and then
 * subtract known-sensitive columns. That pattern silently leaks every
 * new column added by future migrations (audit-flagged risk). This
 * module inverts the sanitizer to an allowlist: only the columns
 * explicitly named here can ever reach a public API response.
 *
 * When adding a new column to machine_listings:
 *   * If it's safe for buyers to see, add it to PUBLIC_MACHINE_LISTING_COLUMNS
 *   * If it's internal (wholesale price, seller identity, admin notes,
 *     internal cost, margin, etc.), do NOT add it — it stays private
 *     automatically.
 */

// The full set of columns that may appear in a public listing
// payload. Anything else on the row is dropped by
// pickPublicMachineListing() below. Ordered roughly by intent
// (identity → product → media → commerce → seller-badge).
export const PUBLIC_MACHINE_LISTING_COLUMNS = [
  "id",
  "created_at",
  "updated_at",
  "status",

  // Product
  "title",
  "description",
  "machine_make",
  "machine_model",
  "machine_year",
  "machine_type",
  "condition",
  "quantity",

  // Location
  "city",
  "state",

  // Commerce (public prices only — wholesale_price_cents is NEVER here)
  "asking_price",
  "buy_now_enabled",
  "buy_now_price",
  "delivery_fee_cents",
  "includes_card_reader",
  "includes_install",
  "includes_delivery",

  // Media
  "photos",
  "image_thumb_url",
  "image_medium_url",
  "image_main_url",

  // Seller badge — the manufacturer_partner_id is safe to expose
  // (it's an opaque identifier used by the UI to fetch the "Sold by"
  // label). The associated wholesale_price_cents is NOT on this list.
  "manufacturer_partner_id",

  // Manufacturer product data (migration 150) — customer-facing
  "sku",
  "msrp_cents",
  "lead_time_days",
  "listing_warranty_summary",
  "spec_sheet_url",
  "brochure_url",
  "video_url",
  "dimensions_text",
  "weight_lbs",
  "electrical_requirements",
  "temperature_zone",
  "payment_system_compatibility",
  "software_compatibility",
  "certifications",
  "manufacturer_shipping_notes",
] as const;

const PUBLIC_SET = new Set<string>(PUBLIC_MACHINE_LISTING_COLUMNS);

/**
 * Reduce a raw machine_listings row to the public allowlist. Also
 * preserves the (already-sanitized) profiles join subobject as
 * `profiles` if the caller included it via
 * `.select("*, profiles!created_by(id, full_name, company_name, verified)")`.
 *
 * Never returns `wholesale_price_cents`, `admin_notes`,
 * `contact_email`, `contact_phone`, or `created_by` — even if some
 * future refactor accidentally re-adds them, they're not on the
 * allowlist, so they're dropped.
 */
export function pickPublicMachineListing(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    if (PUBLIC_SET.has(key)) out[key] = row[key];
  }
  // Pass through the profiles subobject unchanged — it's already
  // scoped to (id, full_name, company_name, verified) by the query.
  if (row.profiles && typeof row.profiles === "object") {
    out.profiles = row.profiles;
  }
  return out;
}
