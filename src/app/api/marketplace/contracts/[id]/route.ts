import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getPlacementPartner, forbidden } from "@/lib/marketplaceAuth";
import { marketplaceContractsEnabled } from "@/lib/marketplaceFlags";
import { isPartnerEligibleForContract } from "@/lib/marketplaceEligibility";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!marketplaceContractsEnabled()) return NextResponse.json({ error: "Contracts not enabled" }, { status: 403 });
  const user = await getPlacementPartner(req);
  if (!user) return forbidden();
  const { id } = await params;

  // Anonymized view first
  const { data: contract, error } = await supabaseAdmin
    .from("partner_visible_contracts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });

  const [{ data: requirements }, { data: myAcceptance }, { data: myTierProposal }] = await Promise.all([
    supabaseAdmin.from("placement_contract_requirements").select("*").eq("contract_id", id),
    supabaseAdmin.from("placement_contract_acceptances").select("*").eq("contract_id", id).eq("partner_id", user.id).is("released_at", null).maybeSingle(),
    supabaseAdmin.from("placement_contract_tier_proposals").select("*").eq("contract_id", id).eq("proposed_by", user.id).eq("status", "pending").maybeSingle(),
  ]);

  const eligibility = await isPartnerEligibleForContract(user.id, id);

  return NextResponse.json({
    contract,
    requirements: requirements || [],
    accepted: !!myAcceptance,
    my_pending_tier_proposal: myTierProposal,
    eligibility,
  });
}
