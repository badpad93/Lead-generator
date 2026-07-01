import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getPlacementPartner, forbidden } from "@/lib/marketplaceAuth";
import { marketplaceContractsEnabled } from "@/lib/marketplaceFlags";

export async function GET(req: NextRequest) {
  if (!marketplaceContractsEnabled()) return NextResponse.json([]);
  const user = await getPlacementPartner(req);
  if (!user) return forbidden();

  const { data: submissions, error } = await supabaseAdmin
    .from("placement_submissions")
    .select("*, placement_contracts:contract_id(title, tier, partner_payout, machine_type, market_state, market_city)")
    .eq("partner_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(submissions || []);
}

export async function POST(req: NextRequest) {
  if (!marketplaceContractsEnabled()) return NextResponse.json({ error: "Contracts not enabled" }, { status: 403 });
  const user = await getPlacementPartner(req);
  if (!user) return forbidden();

  const body = await req.json().catch(() => ({}));
  const contractId = body.contract_id;
  if (!contractId) return NextResponse.json({ error: "Contract required" }, { status: 400 });

  // Verify the partner has accepted this contract
  const { data: acceptance } = await supabaseAdmin
    .from("placement_contract_acceptances")
    .select("id")
    .eq("contract_id", contractId)
    .eq("partner_id", user.id)
    .is("released_at", null)
    .maybeSingle();
  if (!acceptance) return NextResponse.json({ error: "You haven't accepted this contract" }, { status: 400 });

  const businessName = String(body.business_name || "").trim();
  const address = String(body.address || "").trim();
  if (!businessName) return NextResponse.json({ error: "Business name required" }, { status: 400 });
  if (!address) return NextResponse.json({ error: "Address required" }, { status: 400 });

  const insertRow = {
    contract_id: contractId,
    partner_id: user.id,
    business_name: businessName,
    address,
    city: body.city || null,
    state: body.state ? String(body.state).toUpperCase() : null,
    zip: body.zip || null,
    industry: body.industry || null,
    employees: body.employees != null ? Number(body.employees) : null,
    traffic_score: body.traffic_score != null ? Number(body.traffic_score) : null,
    decision_maker_name: body.decision_maker_name || null,
    decision_maker_title: body.decision_maker_title || null,
    decision_maker_email: body.decision_maker_email || null,
    decision_maker_phone: body.decision_maker_phone || null,
    power_available: body.power_available !== false,
    parking_available: body.parking_available !== false,
    machine_recommendation: body.machine_recommendation || null,
    notes: body.notes || null,
  };

  const { data: submission, error } = await supabaseAdmin
    .from("placement_submissions")
    .insert(insertRow)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabaseAdmin.from("placement_submission_activity").insert({
    submission_id: submission.id,
    actor_id: user.id,
    activity_type: "created",
    description: `Submitted "${businessName}"`,
  });

  return NextResponse.json(submission);
}
