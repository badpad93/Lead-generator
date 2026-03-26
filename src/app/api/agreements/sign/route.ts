import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { AGREEMENT_VERSION, AGREEMENT_TEXT } from "@/lib/agreementText";

/** POST /api/agreements/sign — sign an agreement before purchase */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    leadId,
    fullName,
    userEmail,
    acceptedTerms,
    acceptedPopulationClause,
    acceptedEsign,
  } = body;

  // Validate all required fields
  if (!leadId || typeof leadId !== "string") {
    return NextResponse.json({ error: "leadId is required" }, { status: 400 });
  }
  if (!fullName || typeof fullName !== "string" || fullName.trim().length < 2) {
    return NextResponse.json({ error: "Full legal name is required" }, { status: 400 });
  }
  if (!userEmail || typeof userEmail !== "string") {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }
  if (acceptedTerms !== true) {
    return NextResponse.json({ error: "You must accept the terms" }, { status: 400 });
  }
  if (acceptedPopulationClause !== true) {
    return NextResponse.json({ error: "You must accept the population clause" }, { status: 400 });
  }
  if (acceptedEsign !== true) {
    return NextResponse.json({ error: "You must consent to electronic signature" }, { status: 400 });
  }

  // Check for existing agreement for this user + lead (prevent duplicates)
  const { data: existing } = await supabaseAdmin
    .from("signed_agreements")
    .select("id")
    .eq("user_id", userId)
    .eq("lead_id", leadId)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ agreementId: existing.id });
  }

  // Capture IP and user agent server-side
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const userAgent = req.headers.get("user-agent") || "unknown";

  const { data, error } = await supabaseAdmin
    .from("signed_agreements")
    .insert({
      user_id: userId,
      user_email: userEmail,
      lead_id: leadId,
      agreement_version: AGREEMENT_VERSION,
      agreement_text: AGREEMENT_TEXT,
      accepted_terms: true,
      accepted_population_clause: true,
      accepted_esign: true,
      full_name: fullName.trim(),
      ip_address: ip,
      user_agent: userAgent,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ agreementId: data.id });
}
