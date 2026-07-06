import { NextRequest, NextResponse } from "next/server";
import { getPlacementPartner, forbidden } from "@/lib/marketplaceAuth";
import { getOrStartAgreement } from "@/lib/placementAgreements";

/**
 * GET /api/placement/agreement
 *
 * Returns the caller's Placement Provider Agreement + the active template
 * body. If no user_agreements row exists yet, one is lazily created in
 * status='not_started'.
 */
export async function GET(req: NextRequest) {
  const user = await getPlacementPartner(req);
  if (!user) return forbidden();

  const result = await getOrStartAgreement(user.id, "placement_provider");
  if (!result) return NextResponse.json({ error: "No active placement provider agreement template" }, { status: 500 });

  return NextResponse.json({
    template: {
      id: result.template.id,
      version: result.template.version,
      title: result.template.title,
      effective_date: result.template.effective_date,
      content_html: result.template.content_html,
    },
    agreement: result.agreement,
  });
}
