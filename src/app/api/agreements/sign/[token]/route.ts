import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/* ------------------------------------------------------------------ */
/*  GET — Public endpoint: fetch agreement by sign_token              */
/*  No auth required — token-based access for operator signing        */
/* ------------------------------------------------------------------ */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  // Look up agreement by sign_token
  const { data: agreement, error } = await supabaseAdmin
    .from("purchase_agreements")
    .select("*")
    .eq("sign_token", token)
    .single();

  if (error || !agreement) {
    return NextResponse.json({ error: "Agreement not found" }, { status: 404 });
  }

  // Block access if cancelled or expired
  if (["cancelled", "expired"].includes(agreement.agreement_status)) {
    return NextResponse.json(
      { error: "This agreement is no longer available" },
      { status: 404 },
    );
  }

  // If status is 'sent', update to 'viewed' and set viewed_at
  if (agreement.agreement_status === "sent") {
    await supabaseAdmin
      .from("purchase_agreements")
      .update({
        agreement_status: "viewed",
        viewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", agreement.id);

    agreement.agreement_status = "viewed";
    agreement.viewed_at = new Date().toISOString();
  }

  // Fetch existing initials and signatures
  const [{ data: initials }, { data: signatures }] = await Promise.all([
    supabaseAdmin
      .from("agreement_initials")
      .select("*")
      .eq("agreement_id", agreement.id)
      .order("initialed_at", { ascending: true }),
    supabaseAdmin
      .from("agreement_signatures")
      .select("*")
      .eq("agreement_id", agreement.id)
      .order("signed_at", { ascending: false }),
  ]);

  // Log view activity
  await supabaseAdmin.from("agreement_activity_log").insert({
    agreement_id: agreement.id,
    activity_type: "viewed",
    description: "Agreement viewed by operator",
  });

  // Return the agreement data needed for the signing page
  // Exclude internal-only fields (sign_token, internal_notes, legal_overrides)
  return NextResponse.json({
    id: agreement.id,
    agreement_status: agreement.agreement_status,
    agreement_type: agreement.agreement_type,
    template_version: agreement.template_version,

    // Operator info
    operator_company_name: agreement.operator_company_name,
    operator_legal_name: agreement.operator_legal_name,
    operator_email: agreement.operator_email,
    operator_phone: agreement.operator_phone,
    operator_billing_address: agreement.operator_billing_address,
    operator_delivery_address: agreement.operator_delivery_address,
    operator_title: agreement.operator_title,

    // Apex info
    apex_company_name: agreement.apex_company_name,
    apex_representative_name: agreement.apex_representative_name,
    apex_representative_title: agreement.apex_representative_title,

    // Equipment
    machine_model: agreement.machine_model,
    machine_quantity: agreement.machine_quantity,
    machine_unit_price: agreement.machine_unit_price,
    equipment_subtotal: agreement.equipment_subtotal,
    machine_notes: agreement.machine_notes,

    // Location services
    locations_purchased: agreement.locations_purchased,
    location_fee_per_secured: agreement.location_fee_per_secured,
    max_location_service_value: agreement.max_location_service_value,
    location_rejection_allowance: agreement.location_rejection_allowance,
    location_service_timeline_days: agreement.location_service_timeline_days,
    location_payment_terms: agreement.location_payment_terms,

    // Shipping / freight
    standard_freight_rate: agreement.standard_freight_rate,
    discounted_freight_rate: agreement.discounted_freight_rate,
    freight_per_machine: agreement.freight_per_machine,
    freight_total: agreement.freight_total,
    shipping_notes: agreement.shipping_notes,
    storage_fee_per_machine_month: agreement.storage_fee_per_machine_month,
    free_storage_months: agreement.free_storage_months,

    // Payment
    total_due_prior_to_procurement: agreement.total_due_prior_to_procurement,
    payment_due_date: agreement.payment_due_date,
    payment_method_notes: agreement.payment_method_notes,

    // Dates / settings
    effective_date: agreement.effective_date,
    governing_state: agreement.governing_state,
    venue_state: agreement.venue_state,
    contract_expiration_date: agreement.contract_expiration_date,
    customer_notes: agreement.customer_notes,

    // Timestamps
    sent_at: agreement.sent_at,
    viewed_at: agreement.viewed_at,
    operator_signed_at: agreement.operator_signed_at,
    apex_signed_at: agreement.apex_signed_at,

    // Related data
    initials: initials || [],
    signatures: signatures || [],
  });
}
