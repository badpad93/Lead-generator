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

  // When from_lead_id is provided, pull the lead and derive default values
  // for the location_* fields on a location_placement agreement. Rep can
  // still override anything before signing.
  interface LeadRow {
    id: string;
    business_name: string | null;
    contact_name: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    location_placement_agreement_id: string | null;
  }
  let leadRow: LeadRow | null = null;
  if (typeof body.from_lead_id === "string" && body.from_lead_id) {
    const { data } = await supabaseAdmin
      .from("sales_leads")
      .select("id, business_name, contact_name, email, phone, address, location_placement_agreement_id")
      .eq("id", body.from_lead_id)
      .maybeSingle();
    leadRow = (data as unknown) as LeadRow | null;
    if (!leadRow) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    if (leadRow.location_placement_agreement_id) {
      return NextResponse.json({
        error: "This lead already has a placement agreement",
        agreement_id: leadRow.location_placement_agreement_id,
      }, { status: 409 });
    }
  }

  // Best-effort city/state/zip parse off a single-line address.
  function splitAddress(raw: string | null | undefined): { street: string; city: string; state: string; zip: string } {
    if (!raw) return { street: "", city: "", state: "", zip: "" };
    const s = raw.trim();
    // Pattern: "..., City, ST 12345"
    const m = s.match(/^(.*?),\s*([^,]+),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/);
    if (m) return { street: m[1].trim(), city: m[2].trim(), state: m[3].toUpperCase(), zip: m[4] };
    // Pattern: "..., City, ST"
    const m2 = s.match(/^(.*?),\s*([^,]+),\s*([A-Za-z]{2})\s*$/);
    if (m2) return { street: m2[1].trim(), city: m2[2].trim(), state: m2[3].toUpperCase(), zip: "" };
    return { street: s, city: "", state: "", zip: "" };
  }
  const leadAddress = splitAddress(leadRow?.address);

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
      // Location contact (recipient of the agreement). Body values win over
      // lead prefill so the rep can override on the edit screen.
      // Note: forward link to the lead lives on sales_leads.location_placement_agreement_id
      // (stamped below) — purchase_agreements has no lead_id column, so we
      // don't reference it here.
      location_business_name: body.location_business_name || leadRow?.business_name || "",
      location_contact_name: body.location_contact_name || leadRow?.contact_name || "",
      location_contact_email: body.location_contact_email || leadRow?.email || "",
      location_contact_phone: body.location_contact_phone || leadRow?.phone || "",
      location_contact_title: body.location_contact_title || "",
      location_address: body.location_address || leadAddress.street || "",
      location_city: body.location_city || leadAddress.city || "",
      location_state: body.location_state || leadAddress.state || "",
      location_zip: body.location_zip || leadAddress.zip || "",

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
    description: leadRow
      ? `Location placement agreement drafted from lead ${leadRow.id.slice(0, 8)}`
      : "Standalone agreement created",
  });

  // Stamp reverse link on the lead so the leads page shows "already converted"
  // and future clicks return the existing agreement instead of duplicating.
  if (leadRow) {
    await supabaseAdmin
      .from("sales_leads")
      .update({ location_placement_agreement_id: agreement.id })
      .eq("id", leadRow.id);
  }

  return NextResponse.json(agreement, { status: 201 });
}
