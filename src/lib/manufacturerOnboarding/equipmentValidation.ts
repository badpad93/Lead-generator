import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Server-side pricing validation for manufacturer equipment listings.
 *
 * Two rules from the brief:
 *   * final_vc_price >= manufacturer_sale_price
 *   * final_vc_price - manufacturer_sale_price <= $300 unless an
 *     admin-approved pricing exception covers the margin
 *
 * Prices flow as: wholesale_price_cents on machine_listings (cents,
 * INTEGER), buy_now_price on machine_listings (DOLLARS, numeric).
 * All math converts to cents to avoid floating-point drift.
 */

export const DEFAULT_MAX_MARGIN_CENTS = 30000; // $300 per the brief

export interface PricingCheckResult {
  ok: boolean;
  reason?: string;
  code?: "wholesale_missing" | "final_below_wholesale" | "margin_over_cap_needs_exception";
  margin_cents?: number;
  requires_exception_id?: string;
}

/**
 * Validate a proposed pricing pair against the rules + existing
 * approved pricing exceptions on this listing (if any).
 */
export async function validateListingPricing(args: {
  listing_id: string | null;      // null when creating (no exception can exist yet)
  wholesale_price_cents: number | null;
  final_price_cents: number | null;
}): Promise<PricingCheckResult> {
  const { listing_id, wholesale_price_cents, final_price_cents } = args;

  // Manufacturer listings require both prices set. If neither is set
  // the listing is still legitimately in "draft" — the caller should
  // gate publish separately. Return ok:true so drafts can save.
  if (wholesale_price_cents == null && final_price_cents == null) {
    return { ok: true };
  }

  if (wholesale_price_cents == null) {
    return {
      ok: false,
      reason: "Manufacturer equipment sale price is required.",
      code: "wholesale_missing",
    };
  }
  if (final_price_cents == null) {
    return { ok: true }; // draft: only wholesale set
  }

  if (final_price_cents < wholesale_price_cents) {
    return {
      ok: false,
      reason: "Final Vending Connector price cannot be less than the manufacturer sale price.",
      code: "final_below_wholesale",
    };
  }

  const margin = final_price_cents - wholesale_price_cents;
  if (margin <= DEFAULT_MAX_MARGIN_CENTS) {
    return { ok: true, margin_cents: margin };
  }

  // Margin over $300 — must be covered by an approved exception on
  // this listing. Only applies when we have a listing id (an existing
  // row); on create the caller must first save at ≤$300, then
  // request an exception, then update.
  if (!listing_id) {
    return {
      ok: false,
      reason:
        `Margin of $${(margin / 100).toFixed(2)} exceeds the $${(DEFAULT_MAX_MARGIN_CENTS / 100).toFixed(2)} cap. ` +
        `Save the listing at a margin of $${(DEFAULT_MAX_MARGIN_CENTS / 100).toFixed(2)} or less first, ` +
        `then request a pricing exception before raising the price.`,
      code: "margin_over_cap_needs_exception",
      margin_cents: margin,
    };
  }

  const { data: exceptions } = await supabaseAdmin
    .from("machine_listing_pricing_exceptions")
    .select("id, approved_max_margin_cents, status")
    .eq("machine_listing_id", listing_id)
    .eq("status", "approved")
    .order("reviewed_at", { ascending: false })
    .limit(1);

  const cover = exceptions?.[0];
  if (!cover) {
    return {
      ok: false,
      reason:
        `Margin of $${(margin / 100).toFixed(2)} exceeds the $${(DEFAULT_MAX_MARGIN_CENTS / 100).toFixed(2)} cap. ` +
        `Request a pricing exception and wait for admin approval before raising the price.`,
      code: "margin_over_cap_needs_exception",
      margin_cents: margin,
    };
  }
  if (
    cover.approved_max_margin_cents != null &&
    margin > cover.approved_max_margin_cents
  ) {
    return {
      ok: false,
      reason:
        `Approved pricing exception permits margin up to ` +
        `$${((cover.approved_max_margin_cents ?? 0) / 100).toFixed(2)}, ` +
        `but the current margin is $${(margin / 100).toFixed(2)}.`,
      code: "margin_over_cap_needs_exception",
      margin_cents: margin,
      requires_exception_id: cover.id as string,
    };
  }

  return { ok: true, margin_cents: margin, requires_exception_id: cover.id as string };
}
