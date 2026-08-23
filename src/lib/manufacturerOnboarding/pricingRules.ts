/**
 * Pure pricing rules for manufacturer equipment listings — extracted
 * from equipmentValidation.ts so the test suite can exercise them
 * without requiring Supabase env vars at import time.
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
 * Non-DB branch of pricing validation. Returns:
 *   - ok=true for draft states (missing prices)
 *   - the margin, when both prices are present and within the cap
 *   - a rejection with a specific code when the rules fail
 *   - null when the DB has to be consulted (margin over cap +
 *     listing_id is set) — caller must run the exception lookup.
 */
export function computePricingResult(args: {
  listing_id: string | null;
  wholesale_price_cents: number | null;
  final_price_cents: number | null;
}): PricingCheckResult | null {
  const { listing_id, wholesale_price_cents, final_price_cents } = args;

  if (wholesale_price_cents == null && final_price_cents == null) return { ok: true };
  if (wholesale_price_cents == null) {
    return {
      ok: false,
      reason: "Manufacturer equipment sale price is required.",
      code: "wholesale_missing",
    };
  }
  if (final_price_cents == null) return { ok: true };
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
  // DB check required — caller resolves.
  return null;
}
