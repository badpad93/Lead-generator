import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { scoreDeal } from "@/lib/dealScoring";
import { sendIntakeConfirmation, sendAdminIntakeNotification } from "@/lib/intakeEmail";

export async function POST(req: NextRequest) {
  const body = await req.json();

  const {
    full_name,
    business_name,
    email,
    phone,
    services_needed,
    budget_range,
    timeline,
    business_type,
    years_in_business,
    num_employees,
    annual_revenue,
    has_vending_currently,
    current_provider,
    pain_points,
    num_locations_needed,
    target_states,
    target_zips,
    location_types_preferred,
    foot_traffic_estimate,
    is_decision_maker,
    decision_maker_name,
    decision_maker_title,
    decision_timeline,
    notes,
    referral_source,
  } = body;

  if (!full_name || !email) {
    return NextResponse.json({ error: "full_name and email are required" }, { status: 400 });
  }

  // 1. Score the deal
  const scores = scoreDeal({
    services_needed,
    budget_range,
    timeline,
    is_decision_maker,
    has_vending_currently,
    num_locations_needed,
    years_in_business,
    annual_revenue,
    referral_source,
    num_employees,
    pain_points,
  });

  // 2. Upsert account by email
  const { data: existingAccount } = await supabaseAdmin
    .from("sales_accounts")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  let accountId: string;
  if (existingAccount) {
    accountId = existingAccount.id;
  } else {
    const { data: newAccount, error: accErr } = await supabaseAdmin
      .from("sales_accounts")
      .insert({
        business_name: business_name || full_name,
        contact_name: full_name,
        email,
        phone: phone || null,
      })
      .select("id")
      .single();
    if (accErr || !newAccount) {
      return NextResponse.json({ error: "Failed to create account" }, { status: 500 });
    }
    accountId = newAccount.id;
  }

  // 3. Upsert sales_lead by email
  const { data: existingLead } = await supabaseAdmin
    .from("sales_leads")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  let salesLeadId: string;
  if (existingLead) {
    salesLeadId = existingLead.id;
    await supabaseAdmin
      .from("sales_leads")
      .update({
        contact_name: full_name,
        phone,
        business_name: business_name || full_name,
        account_id: accountId,
        status: "new",
      })
      .eq("id", salesLeadId);
  } else {
    const { data: newLead, error: leadErr } = await supabaseAdmin
      .from("sales_leads")
      .insert({
        business_name: business_name || full_name,
        contact_name: full_name,
        email,
        phone: phone || null,
        account_id: accountId,
        status: "new",
        source: referral_source || "intake_form",
      })
      .select("id")
      .single();
    if (leadErr || !newLead) {
      return NextResponse.json({ error: "Failed to create lead" }, { status: 500 });
    }
    salesLeadId = newLead.id;
  }

  // 4. Create deal
  const product = (services_needed?.length || 0) > 1 ? "multi" : services_needed?.[0] || "general";
  const { data: deal, error: dealErr } = await supabaseAdmin
    .from("sales_deals")
    .insert({
      lead_id: salesLeadId,
      account_id: accountId,
      stage: "new",
      value: 0,
      business_name: business_name || full_name,
      deal_quality_score: scores.deal_quality_score,
      intent_score: scores.intent_score,
      budget_score: scores.budget_score,
      readiness_score: scores.readiness_score,
      upsell_score: scores.upsell_score,
    })
    .select("id")
    .single();

  if (dealErr || !deal) {
    return NextResponse.json({ error: "Failed to create deal" }, { status: 500 });
  }

  // 5. Create deal services
  if (services_needed?.length) {
    const serviceRows = services_needed.map((svc: string) => ({
      deal_id: deal.id,
      service_name: svc,
      price: 0,
      status: "pending",
    }));
    await supabaseAdmin.from("deal_services").insert(serviceRows);
  }

  // 6. Save intake_lead record
  const { data: intakeLead, error: intakeErr } = await supabaseAdmin
    .from("intake_leads")
    .insert({
      full_name,
      business_name,
      email,
      phone,
      services_needed: services_needed || [],
      budget_range,
      timeline,
      business_type,
      years_in_business,
      num_employees,
      annual_revenue,
      has_vending_currently: has_vending_currently || false,
      current_provider,
      pain_points,
      num_locations_needed,
      target_states: target_states || [],
      target_zips: target_zips || [],
      location_types_preferred: location_types_preferred || [],
      foot_traffic_estimate,
      is_decision_maker: is_decision_maker !== false,
      decision_maker_name,
      decision_maker_title,
      decision_timeline,
      notes,
      referral_source,
      account_id: accountId,
      deal_id: deal.id,
      sales_lead_id: salesLeadId,
    })
    .select("id")
    .single();

  if (intakeErr) {
    return NextResponse.json({ error: "Failed to save intake data" }, { status: 500 });
  }

  // 7. Send emails (non-blocking)
  const serviceLabels = services_needed || [];
  sendIntakeConfirmation({
    to: email,
    name: full_name,
    services: serviceLabels,
    dealId: deal.id,
  }).catch(() => {});

  sendAdminIntakeNotification({
    leadName: full_name,
    email,
    services: serviceLabels,
    budget: budget_range || "Not specified",
    timeline: timeline || "Not specified",
    dealQualityScore: scores.deal_quality_score,
    dealId: deal.id,
  }).catch(() => {});

  return NextResponse.json({
    success: true,
    intake_lead_id: intakeLead?.id,
    deal_id: deal.id,
    account_id: accountId,
    scores,
  }, { status: 201 });
}
