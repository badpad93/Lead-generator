import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

/* ------------------------------------------------------------------ */
/*  GET — List all agreements (optionally filter by status)            */
/* ------------------------------------------------------------------ */
export async function GET(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const agreementType = searchParams.get("type");

  let query = supabaseAdmin
    .from("purchase_agreements")
    .select("*")
    .order("created_at", { ascending: false });

  if (status && status !== "all") {
    query = query.eq("agreement_status", status);
  }

  if (agreementType && agreementType !== "all") {
    query = query.eq("agreement_type", agreementType);
  }

  const { data: agreements, error } = await query;

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(agreements || []);
}

/* ------------------------------------------------------------------ */
/*  POST — Create a standalone agreement (no order required)           */
/* ------------------------------------------------------------------ */
export async function POST(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));

  const { data: repProfile } = await supabaseAdmin
    .from("profiles")
    .select("email, full_name")
    .eq("id", user.id)
    .single();

  const agreementType = body.agreement_type === "location_placement"
    ? "location_placement"
    : "machine_purchase";

  const basePayload: Record<string, unknown> = {
    order_id: null,
    account_id: null,
    created_by: user.id,
    agreement_status: "draft",
    agreement_type: agreementType,

    // Apex representative (current user)
    apex_representative_name: repProfile?.full_name || "",
    apex_representative_email: repProfile?.email || "",

    // Sales rep tracking — gets a copy when fully signed
    rep_name: repProfile?.full_name || "",
    rep_email: repProfile?.email || "",

    // Dates
    effective_date: new Date().toISOString().slice(0, 10),
  };

  let agreementPayload: Record<string, unknown>;

  if (agreementType === "location_placement") {
    agreementPayload = {
      ...basePayload,
      // Location contact (recipient of the agreement)
      location_business_name: body.location_business_name || "",
      location_contact_name: body.location_contact_name || "",
      location_contact_email: body.location_contact_email || "",
      location_contact_phone: body.location_contact_phone || "",
      location_contact_title: body.location_contact_title || "",
      location_address: body.location_address || "",
      location_city: body.location_city || "",
      location_state: body.location_state || "",
      location_zip: body.location_zip || "",

      // Placement terms
      placement_machine_count: body.placement_machine_count || 1,
      placement_machine_type: body.placement_machine_type || "VendEra AI Machine",
      placement_term_months: body.placement_term_months || 24,
      placement_exclusivity: body.placement_exclusivity !== false,

      // Compensation
      commission_type: body.commission_type || "revenue_share",
      commission_pct: body.commission_pct ?? 10,
      commission_monthly_fee: body.commission_monthly_fee ?? 0,
      commission_payout_schedule: body.commission_payout_schedule || "monthly",

      // Operator placing the machine
      placement_operator_company: body.placement_operator_company || "",
      placement_operator_contact: body.placement_operator_contact || "",
      placement_operator_email: body.placement_operator_email || "",
      placement_operator_phone: body.placement_operator_phone || "",

      // Section toggles
      include_placement_terms: body.include_placement_terms !== false,
      include_compensation: body.include_compensation !== false,
      include_duration_termination: body.include_duration_termination !== false,
      include_responsibilities: body.include_responsibilities !== false,

      // Disable purchase-agreement section toggles so they don't render
      include_equipment: false,
      include_location_services: false,
      include_shipping_storage: false,
    };
  } else {
    agreementPayload = {
      ...basePayload,
      // Operator info (blank or from body)
      operator_company_name: body.operator_company_name || "",
      operator_legal_name: body.operator_legal_name || "",
      operator_email: body.operator_email || "",
      operator_phone: body.operator_phone || "",
      operator_billing_address: body.operator_billing_address || "",
      operator_delivery_address: body.operator_delivery_address || "",
      operator_title: body.operator_title || "",

      // Equipment defaults
      machine_model: body.machine_model || "VendEra AI Machine",
      machine_quantity: body.machine_quantity || 1,
      machine_unit_price: body.machine_unit_price || 3700,
      equipment_subtotal: (body.machine_quantity || 1) * (body.machine_unit_price || 3700),

      // Location services
      locations_purchased: body.locations_purchased || 0,
      location_fee_per_secured: body.location_fee_per_secured || 400,
      max_location_service_value: (body.locations_purchased || 0) * (body.location_fee_per_secured || 400),

      // Freight / shipping
      freight_per_machine: body.freight_per_machine || 350,
      freight_total: (body.machine_quantity || 1) * (body.freight_per_machine || 350),

      // Payment
      total_due_prior_to_procurement:
        (body.machine_quantity || 1) * (body.machine_unit_price || 3700) +
        (body.machine_quantity || 1) * (body.freight_per_machine || 350),
    };
  }

  const { data: agreement, error: insertErr } = await supabaseAdmin
    .from("purchase_agreements")
    .insert(agreementPayload)
    .select("*")
    .single();

  if (insertErr)
    return NextResponse.json({ error: insertErr.message }, { status: 500 });

  await supabaseAdmin.from("agreement_activity_log").insert({
    agreement_id: agreement.id,
    user_id: user.id,
    activity_type: "created",
    description: "Standalone agreement created",
  });

  return NextResponse.json(agreement, { status: 201 });
}
