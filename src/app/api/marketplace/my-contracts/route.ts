import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getPlacementPartner, forbidden } from "@/lib/marketplaceAuth";

/**
 * GET /api/marketplace/my-contracts
 *
 * Contracts the calling placement partner has accepted (not released) —
 * still-active work with real-time slots_remaining. Uses
 * partner_visible_contracts (identity-scrubbed) joined against the caller's
 * placement_contract_acceptances. Returns fulfilled contracts too so the
 * PP can see history of work they completed.
 */
export async function GET(req: NextRequest) {
  const user = await getPlacementPartner(req);
  if (!user) return forbidden();

  const { data: acceptances } = await supabaseAdmin
    .from("placement_contract_acceptances")
    .select("contract_id, slots_locked, accepted_at, released_at")
    .eq("partner_id", user.id)
    .is("released_at", null)
    .order("accepted_at", { ascending: false });

  if (!acceptances || acceptances.length === 0) {
    return NextResponse.json([]);
  }

  const contractIds = acceptances.map((a) => a.contract_id);

  // View includes 'open' + 'in_progress' — pull directly from
  // placement_contracts for accepted rows so we also see 'fulfilled' history.
  const { data: contracts, error } = await supabaseAdmin
    .from("placement_contracts")
    .select("id, title, tier, partner_payout, market_state, market_city, machine_type, contract_type, locations_needed, locations_filled, deadline_at, status, notes, created_at")
    .in("id", contractIds)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const acceptancesByContract = new Map(acceptances.map((a) => [a.contract_id, a]));

  // For each contract, count how many of my submissions are still pending +
  // how many are accepted so the PP can see their own progress.
  const { data: mySubs } = await supabaseAdmin
    .from("placement_submissions")
    .select("contract_id, admin_status, operator_status")
    .eq("partner_id", user.id)
    .in("contract_id", contractIds);

  const submissionCounts = new Map<string, { submitted: number; accepted: number; pending: number; rejected: number }>();
  for (const s of mySubs || []) {
    const bucket = submissionCounts.get(s.contract_id) || { submitted: 0, accepted: 0, pending: 0, rejected: 0 };
    bucket.submitted++;
    if (s.operator_status === "accepted") bucket.accepted++;
    else if (s.operator_status === "rejected" || s.admin_status === "rejected") bucket.rejected++;
    else bucket.pending++;
    submissionCounts.set(s.contract_id, bucket);
  }

  const rows = (contracts || []).map((c) => {
    const a = acceptancesByContract.get(c.id);
    const counts = submissionCounts.get(c.id) || { submitted: 0, accepted: 0, pending: 0, rejected: 0 };
    return {
      ...c,
      slots_remaining: Math.max(0, (c.locations_needed || 0) - (c.locations_filled || 0)),
      my_accepted_at: a?.accepted_at || null,
      my_slots_locked: a?.slots_locked || 0,
      my_submissions: counts,
    };
  });

  return NextResponse.json(rows);
}
