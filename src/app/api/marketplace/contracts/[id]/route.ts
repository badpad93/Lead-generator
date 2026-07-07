import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getMarketplaceViewer } from "@/lib/marketplaceAuth";
import { isPartnerEligibleForContract } from "@/lib/marketplaceEligibility";

/**
 * GET — contract detail. Open to any authed viewer (via getMarketplaceViewer)
 * so operators/sales/requestors can preview a contract before adding locator
 * capability to their account. Only the accept/submit/tier-propose routes
 * require getPlacementPartner.
 *
 * Response includes `is_partner` so the client renders either the accept
 * flow (for real PPs) or the "Add locator capability" CTA. When the caller
 * has no placement_partners row, eligibility is synthesized as ineligible
 * with a "become a locator" reason instead of hitting the eligibility helper
 * (which assumes a partner row exists).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getMarketplaceViewer(req);
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { data: contract, error } = await supabaseAdmin
    .from("partner_visible_contracts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });

  const requirementsPromise = supabaseAdmin
    .from("placement_contract_requirements")
    .select("*")
    .eq("contract_id", id);

  const [{ data: requirements }, myAcceptance, myTierProposal, eligibility] = await Promise.all([
    requirementsPromise,
    viewer.is_partner
      ? supabaseAdmin
          .from("placement_contract_acceptances")
          .select("*")
          .eq("contract_id", id)
          .eq("partner_id", viewer.id)
          .is("released_at", null)
          .maybeSingle()
          .then((r) => r.data)
      : Promise.resolve(null),
    viewer.is_partner
      ? supabaseAdmin
          .from("placement_contract_tier_proposals")
          .select("*")
          .eq("contract_id", id)
          .eq("proposed_by", viewer.id)
          .eq("status", "pending")
          .maybeSingle()
          .then((r) => r.data)
      : Promise.resolve(null),
    viewer.is_partner
      ? isPartnerEligibleForContract(viewer.id, id)
      : Promise.resolve({
          eligible: false,
          reasons: ["Add locator capability to your account to accept contracts."],
        }),
  ]);

  return NextResponse.json({
    contract,
    requirements: requirements || [],
    accepted: !!myAcceptance,
    my_pending_tier_proposal: myTierProposal,
    eligibility,
    is_partner: viewer.is_partner,
    partner_onboarding_complete: viewer.partner_onboarding_complete,
    viewer_role: viewer.role,
  });
}
