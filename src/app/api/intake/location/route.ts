import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendLocationIntakeNotification, sendLocationRequestConfirmation } from "@/lib/intakeEmail";

export async function POST(req: NextRequest) {
  const body = await req.json();

  const {
    deal_id,
    account_id,
    intake_lead_id,
    client_name,
    client_email,
    client_phone,
    target_zips,
    target_cities,
    target_states,
    machine_count,
    machine_types,
    preferred_location_types,
    min_foot_traffic,
    max_commission_rate,
    preferences,
    restrictions,
    budget,
    expected_monthly_revenue,
    placement_timeline,
    has_business_license,
    has_insurance,
    has_w9,
    agreement_notes,
  } = body;

  if (!client_name) {
    return NextResponse.json({ error: "client_name is required" }, { status: 400 });
  }

  // Create location request
  const { data: locReq, error } = await supabaseAdmin
    .from("location_requests")
    .insert({
      deal_id: deal_id || null,
      account_id: account_id || null,
      intake_lead_id: intake_lead_id || null,
      client_name,
      client_email,
      client_phone,
      target_zips: target_zips || [],
      target_cities: target_cities || [],
      target_states: target_states || [],
      machine_count: machine_count || 1,
      machine_types: machine_types || [],
      preferred_location_types: preferred_location_types || [],
      min_foot_traffic: min_foot_traffic || null,
      max_commission_rate: max_commission_rate || null,
      preferences: preferences || {},
      restrictions: restrictions || {},
      budget: budget || null,
      expected_monthly_revenue: expected_monthly_revenue || null,
      placement_timeline: placement_timeline || null,
      has_business_license: has_business_license || false,
      has_insurance: has_insurance || false,
      has_w9: has_w9 || false,
      agreement_notes: agreement_notes || null,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !locReq) {
    return NextResponse.json({ error: "Failed to create location request" }, { status: 500 });
  }

  // Update deal stage if linked
  if (deal_id) {
    await supabaseAdmin
      .from("sales_deals")
      .update({ stage: "qualified" })
      .eq("id", deal_id);
  }

  // Send admin notification
  const targetAreas = [
    ...(target_cities || []),
    ...(target_states || []),
  ].join(", ") || "Not specified";

  sendLocationIntakeNotification({
    clientName: client_name,
    machineCount: machine_count || 1,
    targetAreas,
    dealId: deal_id || "",
  }).catch(() => {});

  if (client_email) {
    sendLocationRequestConfirmation({
      to: client_email,
      name: client_name,
    }).catch(() => {});
  }

  return NextResponse.json({
    success: true,
    location_request_id: locReq.id,
  }, { status: 201 });
}
