import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getOperatorUser, forbidden, getOperatorContractIds } from "@/lib/operatorMarketplaceAuth";

/**
 * GET /api/operator/contracts/[id]
 *
 * Full contract-scoped view for the operator: contract meta, all
 * admin-approved submissions (identity-scrubbed via
 * operator_visible_submissions), invoice + payment rollups.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOperatorUser(req);
  if (!user) return forbidden();
  const { id } = await params;

  const contractIds = await getOperatorContractIds(user);
  if (!contractIds.includes(id)) return forbidden("You are not the operator on this contract");

  const { data: contract, error: contractErr } = await supabaseAdmin
    .from("placement_contracts")
    .select("id, title, tier, operator_price, market_state, market_city, machine_type, contract_type, locations_needed, locations_filled, deadline_at, status, notes, billing_prepaid, created_at")
    .eq("id", id)
    .maybeSingle();
  if (contractErr) return NextResponse.json({ error: contractErr.message }, { status: 500 });
  if (!contract) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Identity-scrubbed submissions
  const { data: submissions } = await supabaseAdmin
    .from("operator_visible_submissions")
    .select("*")
    .eq("contract_id", id)
    .order("created_at", { ascending: false });

  // Invoices for this contract (visible to the operator — they need to know
  // what they've been billed for)
  const { data: invoices } = await supabaseAdmin
    .from("marketplace_operator_invoices")
    .select("id, submission_id, amount, status, qb_invoice_id, triggered_at, sent_at, paid_at, paid_method")
    .eq("contract_id", id)
    .order("triggered_at", { ascending: false });

  return NextResponse.json({
    contract: {
      ...contract,
      slots_remaining: Math.max(0, (contract.locations_needed || 0) - (contract.locations_filled || 0)),
    },
    submissions: submissions || [],
    invoices: invoices || [],
  });
}
