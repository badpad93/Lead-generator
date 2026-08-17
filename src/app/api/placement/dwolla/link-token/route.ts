import { NextRequest, NextResponse } from "next/server";
import { getPlacementPartner } from "@/lib/marketplaceAuth";
import { createLinkToken } from "@/lib/plaid";

/**
 * POST /api/placement/dwolla/link-token
 *
 * Returns a short-lived Plaid Link token the frontend hands to the
 * Plaid Link Web SDK. Token is scoped to the calling PP.
 */
export async function POST(req: NextRequest) {
  const pp = await getPlacementPartner(req);
  if (!pp) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const link = await createLinkToken({
      clientUserId: pp.id,
      userLegalName: pp.full_name,
      userEmail: pp.email,
    });
    return NextResponse.json({
      link_token: link.link_token,
      expiration: link.expiration,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[dwolla/link-token] failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
