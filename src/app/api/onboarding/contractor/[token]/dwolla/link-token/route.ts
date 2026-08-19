import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hashToken } from "@/lib/contractorOnboarding/token";
import { createLinkToken } from "@/lib/plaid";

/**
 * POST /api/onboarding/contractor/[token]/dwolla/link-token
 *
 * Creates a Plaid Link token scoped to the contractor onboarding
 * row. Token in the URL is the auth. Used by the Payment step to
 * launch the Plaid Link modal.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const hash = hashToken(token);
  const { data } = await supabaseAdmin
    .from("contractor_onboarding")
    .select("id, contractor_email, contractor_name, status, locked, token_expires_at")
    .eq("token_hash", hash)
    .maybeSingle();
  if (!data) return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  if (data.locked || data.status === "completed") {
    return NextResponse.json({ error: "This packet is locked." }, { status: 409 });
  }
  if (data.status === "revoked") {
    return NextResponse.json({ error: "This link has been cancelled." }, { status: 410 });
  }
  if (new Date(data.token_expires_at) < new Date()) {
    return NextResponse.json({ error: "This link has expired." }, { status: 410 });
  }

  try {
    const link = await createLinkToken({
      // Scope Plaid Link to this specific onboarding record so
      // Plaid's per-user rate limits + item tracking are honest.
      clientUserId: data.id,
      userLegalName: data.contractor_name ?? undefined,
      userEmail: data.contractor_email,
    });
    return NextResponse.json({
      link_token: link.link_token,
      expiration: link.expiration,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[contractor-onboarding/link-token] failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
