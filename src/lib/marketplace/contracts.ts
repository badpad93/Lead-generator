import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getMarketplaceSettings } from "./settings";
import { TIER_PRICES } from "@/lib/pricing/locationPricing";

/**
 * Auto-bridge a location_services workflow to a placement_contracts
 * row so placement providers see the job in the marketplace.
 *
 * Called by paymentSync once the operator's $100/location deposit
 * clears — that gate ensures we don't expose speculative requests to
 * PPs. Idempotent: safe to call repeatedly, only ever inserts one
 * contract per workflow. Backfills workflow.placement_contract_id if
 * the FK on the workflow side was missed.
 *
 * Pricing (all dollars, matching the placement_contracts schema):
 *   operator_price   = $500 / location (standard tier-1 placement fee
 *                      the operator already committed to via the
 *                      $500-per-location balance in
 *                      /api/request-location)
 *   platform_fee     = marketplace settings platform_take
 *                      (admin-editable via /admin/marketplace/settings)
 *   partner_payout   = operator_price - platform_fee
 *
 * Admin can override any of those per-contract afterwards; the
 * defaults just get the bridge out of the way.
 */

// Baseline operator-per-location fee. Uses TIER_PRICES[1] (the
// "Basic" tier) as the shared source of truth with the customer-
// facing location pricing engine so a tier price change lands in
// both places. Admin can override per-contract afterwards.
const OPERATOR_PRICE_DOLLARS = TIER_PRICES[1];

export async function ensureContractForLocationServicesWorkflow(
  workflowId: string,
): Promise<{ contractId: string | null; created: boolean }> {
  const { data: workflow, error: fetchErr } = await supabaseAdmin
    .from("workflows")
    .select(
      "id, customer_id, order_id, quantity_purchased, workflow_type, placement_contract_id, metadata",
    )
    .eq("id", workflowId)
    .maybeSingle();

  if (fetchErr) {
    console.error("[marketplace/bridge] workflow fetch failed:", fetchErr);
    return { contractId: null, created: false };
  }
  if (!workflow) return { contractId: null, created: false };
  if (workflow.workflow_type !== "location_services") {
    return { contractId: null, created: false };
  }
  if (workflow.placement_contract_id) {
    return { contractId: workflow.placement_contract_id as string, created: false };
  }

  // Idempotency guard — contract may already exist keyed by workflow_id
  // even if the reverse FK on workflows wasn't stamped. Backfill it.
  const { data: existing } = await supabaseAdmin
    .from("placement_contracts")
    .select("id")
    .eq("workflow_id", workflowId)
    .maybeSingle();
  if (existing) {
    await supabaseAdmin
      .from("workflows")
      .update({ placement_contract_id: existing.id })
      .eq("id", workflowId)
      .is("placement_contract_id", null);
    return { contractId: existing.id as string, created: false };
  }

  const metadata =
    (workflow.metadata as Record<string, unknown> | null) ?? {};
  const intake =
    (metadata.source_intake as Record<string, unknown> | undefined) ?? {};

  const marketState =
    typeof intake.state === "string" ? intake.state.trim() : "";
  const businessName =
    typeof intake.business_name === "string"
      ? intake.business_name.trim()
      : "";
  // machine_type came from the /request-location selector (Combo / AI
  // / Water / Coffee / ATM). placement_contracts.machine_type is free
  // text — the marketplace card renders whatever we stamp here, so
  // pass it through verbatim when present.
  const machineType =
    typeof intake.machine_type === "string" && intake.machine_type.trim()
      ? intake.machine_type.trim()
      : null;

  const settings = await getMarketplaceSettings();
  const platformFeeDollars = Math.min(
    settings.platformTakeDollars,
    OPERATOR_PRICE_DOLLARS,
  );
  const partnerPayoutDollars = OPERATOR_PRICE_DOLLARS - platformFeeDollars;

  const locationsNeeded =
    Number(workflow.quantity_purchased) ||
    Number(intake.machine_count) ||
    1;

  const title = `Location Services — ${businessName || "Operator"} (${locationsNeeded} location${locationsNeeded > 1 ? "s" : ""})`;

  const { data: inserted, error: contractErr } = await supabaseAdmin
    .from("placement_contracts")
    .insert({
      title,
      tier: 1,
      operator_price: OPERATOR_PRICE_DOLLARS,
      partner_payout: partnerPayoutDollars,
      platform_fee: platformFeeDollars,
      market_state: marketState || null,
      market_city: null,
      machine_type: machineType,
      contract_type: locationsNeeded > 1 ? "multi" : "single",
      locations_needed: locationsNeeded,
      locations_filled: 0,
      source_order_id: workflow.order_id ?? null,
      operator_profile_id: workflow.customer_id ?? null,
      operator_business_name: businessName || null,
      status: "open",
      workflow_id: workflowId,
    })
    .select("id")
    .single();

  if (contractErr || !inserted) {
    console.error("[marketplace/bridge] contract insert failed:", contractErr);
    return { contractId: null, created: false };
  }

  const { error: linkErr } = await supabaseAdmin
    .from("workflows")
    .update({ placement_contract_id: inserted.id })
    .eq("id", workflowId);
  if (linkErr) {
    console.error("[marketplace/bridge] workflow link update failed:", linkErr);
  }

  return { contractId: inserted.id as string, created: true };
}
