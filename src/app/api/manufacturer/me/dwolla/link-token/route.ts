import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { createLinkToken } from "@/lib/plaid";

/**
 * POST /api/manufacturer/me/dwolla/link-token
 *
 * Plaid Link token scoped to this manufacturer partner. Same shape
 * as the placement partner + contractor onboarding equivalents;
 * clientUserId keys off the partner id (== profile id) so Plaid's
 * rate limits + item tracking honor the manufacturer identity.
 */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: partner } = await supabaseAdmin
    .from("manufacturer_partners")
    .select("id, legal_company_name, primary_contact_email, primary_contact_name, status")
    .eq("id", userId)
    .maybeSingle();
  if (!partner) return NextResponse.json({ error: "No partner record yet" }, { status: 404 });
  if (partner.status !== "draft" && partner.status !== "changes_requested") {
    return NextResponse.json(
      { error: "This application is locked from further edits." },
      { status: 409 },
    );
  }
  if (!partner.primary_contact_email) {
    return NextResponse.json(
      { error: "Add a primary contact email in Step 1 before linking a bank." },
      { status: 400 },
    );
  }

  try {
    const link = await createLinkToken({
      clientUserId: partner.id,
      userLegalName: partner.primary_contact_name ?? partner.legal_company_name,
      userEmail: partner.primary_contact_email,
    });
    return NextResponse.json({ link_token: link.link_token, expiration: link.expiration });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[manufacturer/dwolla/link-token] failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
