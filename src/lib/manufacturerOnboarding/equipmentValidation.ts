import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  computePricingResult,
  DEFAULT_MAX_MARGIN_CENTS,
  type PricingCheckResult,
} from "./pricingRules";

/**
 * Server-side pricing validation for manufacturer equipment listings.
 * Pure branches (missing price, negative margin, in-cap margin,
 * over-cap margin on a new listing) live in ./pricingRules.ts and
 * are unit-tested there. This module composes those with the DB
 * check for admin-approved pricing exceptions on existing listings.
 */

export { DEFAULT_MAX_MARGIN_CENTS };
export type { PricingCheckResult };

export async function validateListingPricing(args: {
  listing_id: string | null;
  wholesale_price_cents: number | null;
  final_price_cents: number | null;
}): Promise<PricingCheckResult> {
  const pureResult = computePricingResult(args);
  if (pureResult) return pureResult;

  // Fell through — margin > cap AND listing_id is present. Look up
  // an approved exception whose approved_max_margin_cents covers the
  // current margin.
  const { listing_id, wholesale_price_cents, final_price_cents } = args;
  const margin = (final_price_cents as number) - (wholesale_price_cents as number);

  const { data: exceptions } = await supabaseAdmin
    .from("machine_listing_pricing_exceptions")
    .select("id, approved_max_margin_cents, status")
    .eq("machine_listing_id", listing_id!)
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
