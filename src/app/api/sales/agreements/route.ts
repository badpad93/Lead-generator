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

  let query = supabaseAdmin
    .from("purchase_agreements")
    .select("*")
    .order("created_at", { ascending: false });

  if (status && status !== "all") {
    query = query.eq("agreement_status", status);
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

  const agreementPayload = {
    order_id: null,
    account_id: null,
    created_by: user.id,
    agreement_status: "draft",
    agreement_type: body.agreement_type || "machine_purchase",

    // Operator info (blank or from body)
    operator_company_name: body.operator_company_name || "",
    operator_legal_name: body.operator_legal_name || "",
    operator_email: body.operator_email || "",
    operator_phone: body.operator_phone || "",
    operator_billing_address: body.operator_billing_address || "",
    operator_delivery_address: body.operator_delivery_address || "",
    operator_title: body.operator_title || "",

    // Apex representative (current user)
    apex_representative_name: repProfile?.full_name || "",
    apex_representative_email: repProfile?.email || "",

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

    // Dates
    effective_date: new Date().toISOString().slice(0, 10),
  };

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
