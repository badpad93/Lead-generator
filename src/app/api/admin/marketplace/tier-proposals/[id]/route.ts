import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";
import { pricingForTier } from "@/lib/marketplacePricing";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const action = body.action;
  const note = String(body.note || "").trim();

  const { data: proposal } = await supabaseAdmin
    .from("placement_contract_tier_proposals")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (proposal.status !== "pending") {
    return NextResponse.json({ error: "Already reviewed" }, { status: 400 });
  }

  if (action !== "approve" && action !== "deny") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const now = new Date().toISOString();
  await supabaseAdmin
    .from("placement_contract_tier_proposals")
    .update({
      status: action === "approve" ? "approved" : "denied",
      reviewed_by: adminId,
      reviewed_at: now,
      review_note: note || null,
    })
    .eq("id", id);

  if (action === "approve") {
    const p = pricingForTier(proposal.to_tier);
    await supabaseAdmin
      .from("placement_contracts")
      .update({
        tier: proposal.to_tier,
        operator_price: p.operator_price,
        partner_payout: p.partner_payout,
        updated_at: now,
      })
      .eq("id", proposal.contract_id);

    await supabaseAdmin.from("placement_contract_activity").insert({
      contract_id: proposal.contract_id,
      actor_id: adminId,
      activity_type: "tier_proposal_approved",
      description: `Tier bump ${proposal.from_tier} → ${proposal.to_tier} approved (PP $${p.partner_payout} / Op $${p.operator_price})${note ? `: ${note}` : ""}`,
    });
  } else {
    await supabaseAdmin.from("placement_contract_activity").insert({
      contract_id: proposal.contract_id,
      actor_id: adminId,
      activity_type: "tier_proposal_denied",
      description: `Tier bump ${proposal.from_tier} → ${proposal.to_tier} denied${note ? `: ${note}` : ""}`,
    });
  }

  return NextResponse.json({ ok: true });
}
