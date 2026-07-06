import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getOperatorUser, forbidden, getOperatorContractIds } from "@/lib/operatorMarketplaceAuth";

/**
 * GET /api/operator/contracts
 *
 * Contracts the caller is the operator on — either by direct
 * placement_contracts.operator_profile_id match OR through a signed
 * purchase_agreements row whose operator_email matches the caller's email
 * (see getOperatorContractIds).
 *
 * Returns identity-scrubbed contract rows: no partner_id, no PII from the
 * submission side. Each row includes live slots + submission counts + how
 * much has been invoiced/paid so far.
 */
export async function GET(req: NextRequest) {
  const user = await getOperatorUser(req);
  if (!user) return forbidden();

  const contractIds = await getOperatorContractIds(user);
  if (contractIds.length === 0) return NextResponse.json([]);

  const { data: contracts, error } = await supabaseAdmin
    .from("placement_contracts")
    .select("id, title, tier, operator_price, market_state, market_city, machine_type, contract_type, locations_needed, locations_filled, deadline_at, status, notes, billing_prepaid, created_at")
    .in("id", contractIds)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!contracts || contracts.length === 0) return NextResponse.json([]);

  // Roll up submission counts per contract (approved by admin = visible to op).
  const { data: subs } = await supabaseAdmin
    .from("placement_submissions")
    .select("contract_id, admin_status, operator_status")
    .in("contract_id", contractIds)
    .eq("admin_status", "approved");
  const subCounts = new Map<string, { total: number; accepted: number; pending: number; rejected: number }>();
  for (const s of subs || []) {
    const bucket = subCounts.get(s.contract_id) || { total: 0, accepted: 0, pending: 0, rejected: 0 };
    bucket.total++;
    if (s.operator_status === "accepted") bucket.accepted++;
    else if (s.operator_status === "rejected") bucket.rejected++;
    else bucket.pending++;
    subCounts.set(s.contract_id, bucket);
  }

  // Invoice totals per contract (queued / sent_to_qb / paid).
  const { data: invs } = await supabaseAdmin
    .from("marketplace_operator_invoices")
    .select("contract_id, amount, status")
    .in("contract_id", contractIds);
  const invTotals = new Map<string, { queued: number; sent: number; paid: number }>();
  for (const inv of invs || []) {
    const bucket = invTotals.get(inv.contract_id) || { queued: 0, sent: 0, paid: 0 };
    const amt = Number(inv.amount || 0);
    if (inv.status === "paid") bucket.paid += amt;
    else if (inv.status === "sent_to_qb") bucket.sent += amt;
    else bucket.queued += amt;
    invTotals.set(inv.contract_id, bucket);
  }

  const rows = contracts.map((c) => ({
    ...c,
    slots_remaining: Math.max(0, (c.locations_needed || 0) - (c.locations_filled || 0)),
    submissions: subCounts.get(c.id) || { total: 0, accepted: 0, pending: 0, rejected: 0 },
    invoices_total: invTotals.get(c.id) || { queued: 0, sent: 0, paid: 0 },
  }));

  return NextResponse.json(rows);
}
