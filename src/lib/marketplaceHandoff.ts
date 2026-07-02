/**
 * Phase 2.3 — Operator handoff.
 *
 * createContractFromAgreement — called from handleFullySignedAgreement when
 *   send_to_marketplace is true. Idempotent (checks marketplace_contract_id).
 *
 * queuePartnerPayoutForSubmission — called when operator accepts a submission.
 *   Inserts a marketplace_payouts row in 'queued'; Phase 2.4 QB worker drains.
 *
 * queueOperatorInvoiceForSubmission — same, for the operator side.
 */

import { supabaseAdmin } from "./supabaseAdmin";
import { pricingForTier } from "./marketplacePricing";

interface PurchaseAgreement {
  id: string;
  operator_email: string | null;
  operator_company_name: string | null;
  operator_delivery_address: string | null;
  machine_model: string | null;
  locations_purchased: number | null;
  marketplace_contract_id: string | null;
  send_to_marketplace: boolean | null;
  order_id: string | null;
  account_id: string | null;
  operator_id: string | null;
  created_by: string | null;
}

function parseCityState(address: string | null): { city: string | null; state: string | null } {
  if (!address) return { city: null, state: null };
  // Best-effort parse: "…City, ST 12345" or "…City, ST"
  const match = address.match(/,\s*([^,]+),\s*([A-Za-z]{2})(\s+\d{5}(-\d{4})?)?\s*$/);
  if (match) return { city: match[1].trim(), state: match[2].toUpperCase() };
  return { city: null, state: null };
}

async function findOperatorProfileId(email: string | null): Promise<string | null> {
  if (!email) return null;
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .ilike("email", email.trim())
    .maybeSingle();
  return data?.id || null;
}

export async function createContractFromAgreement(agreementId: string): Promise<string | null> {
  const { data: ag } = await supabaseAdmin
    .from("purchase_agreements")
    .select("*")
    .eq("id", agreementId)
    .maybeSingle<PurchaseAgreement>();
  if (!ag) return null;
  if (!ag.send_to_marketplace) return null;
  if (ag.marketplace_contract_id) return ag.marketplace_contract_id; // idempotent

  const pricing = pricingForTier(1);
  const { city, state } = parseCityState(ag.operator_delivery_address);
  const locationsNeeded = Math.max(1, Number(ag.locations_purchased) || 1);
  const operatorProfileId = ag.operator_id || (await findOperatorProfileId(ag.operator_email));

  const insertRow = {
    title: `${ag.operator_company_name || "Operator"} — ${locationsNeeded} location${locationsNeeded > 1 ? "s" : ""}`,
    tier: 1,
    operator_price: pricing.operator_price,
    partner_payout: pricing.partner_payout,
    platform_fee: pricing.platform_fee,
    machine_type: ag.machine_model || "VendEra AI Machine",
    market_state: state,
    market_city: city,
    contract_type: locationsNeeded > 1 ? "multi" : "single",
    locations_needed: locationsNeeded,
    locations_filled: 0,
    source_order_id: ag.order_id,
    source_agreement_id: ag.id,
    operator_profile_id: operatorProfileId,
    operator_business_name: ag.operator_company_name,
    status: "open",
    notes: `Auto-created from signed agreement. Delivery address: ${ag.operator_delivery_address || "—"}`,
    created_by: ag.created_by,
  };

  const { data: contract, error } = await supabaseAdmin
    .from("placement_contracts")
    .insert(insertRow)
    .select("id")
    .single();
  if (error || !contract) return null;

  await supabaseAdmin
    .from("purchase_agreements")
    .update({ marketplace_contract_id: contract.id, updated_at: new Date().toISOString() })
    .eq("id", agreementId);

  await supabaseAdmin.from("placement_contract_activity").insert({
    contract_id: contract.id,
    actor_id: ag.created_by,
    activity_type: "auto_created",
    description: `Contract auto-created from signed agreement ${ag.id.slice(0, 8)} — ${locationsNeeded} location(s) at Tier 1`,
  });

  return contract.id;
}

interface AcceptContext {
  submissionId: string;
  triggeredBy: string | null;
}

export async function queuePartnerPayoutForSubmission({ submissionId, triggeredBy }: AcceptContext): Promise<void> {
  const { data: sub } = await supabaseAdmin
    .from("placement_submissions")
    .select("id, contract_id, partner_id, company_id")
    .eq("id", submissionId)
    .maybeSingle();
  if (!sub) return;

  const { data: contract } = await supabaseAdmin
    .from("placement_contracts")
    .select("partner_payout")
    .eq("id", sub.contract_id)
    .maybeSingle();
  if (!contract) return;

  // Idempotent: unique on submission_id — swallow duplicate-key errors.
  try {
    await supabaseAdmin
      .from("marketplace_payouts")
      .insert({
        submission_id: sub.id,
        contract_id: sub.contract_id,
        partner_id: sub.partner_id,
        company_id: sub.company_id,
        amount: contract.partner_payout,
        status: "queued",
        triggered_by: triggeredBy,
      });
  } catch {
    /* already queued */
  }
}

export async function queueOperatorInvoiceForSubmission({ submissionId, triggeredBy }: AcceptContext): Promise<void> {
  const { data: sub } = await supabaseAdmin
    .from("placement_submissions")
    .select("id, contract_id")
    .eq("id", submissionId)
    .maybeSingle();
  if (!sub) return;

  const { data: contract } = await supabaseAdmin
    .from("placement_contracts")
    .select("operator_price, operator_profile_id, operator_business_name, source_agreement_id")
    .eq("id", sub.contract_id)
    .maybeSingle();
  if (!contract) return;

  let operatorEmail: string | null = null;
  if (contract.source_agreement_id) {
    const { data: ag } = await supabaseAdmin
      .from("purchase_agreements")
      .select("operator_email")
      .eq("id", contract.source_agreement_id)
      .maybeSingle();
    operatorEmail = ag?.operator_email || null;
  }

  try {
    await supabaseAdmin
      .from("marketplace_operator_invoices")
      .insert({
        submission_id: sub.id,
        contract_id: sub.contract_id,
        operator_profile_id: contract.operator_profile_id,
        operator_email: operatorEmail,
        operator_business_name: contract.operator_business_name,
        amount: contract.operator_price,
        status: "queued",
        triggered_by: triggeredBy,
      });
  } catch {
    /* already queued */
  }
}
