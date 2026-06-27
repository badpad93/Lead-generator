import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

/* ------------------------------------------------------------------ */
/*  GET — Single agreement with all related data                      */
/* ------------------------------------------------------------------ */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data: agreement, error } = await supabaseAdmin
    .from("purchase_agreements")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !agreement)
    return NextResponse.json({ error: "Agreement not found" }, { status: 404 });

  // Fetch related data in parallel
  const [
    { data: signatures },
    { data: initials },
    { data: activity },
  ] = await Promise.all([
    supabaseAdmin
      .from("agreement_signatures")
      .select("*")
      .eq("agreement_id", id)
      .order("signed_at", { ascending: false }),
    supabaseAdmin
      .from("agreement_initials")
      .select("*")
      .eq("agreement_id", id)
      .order("initialed_at", { ascending: false }),
    supabaseAdmin
      .from("agreement_activity_log")
      .select("*")
      .eq("agreement_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return NextResponse.json({
    ...agreement,
    signatures: signatures || [],
    initials: initials || [],
    activity: activity || [],
  });
}

/* ------------------------------------------------------------------ */
/*  PATCH — Update agreement fields                                   */
/* ------------------------------------------------------------------ */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();

  // Block sales-role users from editing legal_overrides
  if (user.role === "sales" && "legal_overrides" in body) {
    return NextResponse.json(
      { error: "Only admins or directors can modify legal overrides" },
      { status: 403 },
    );
  }

  const allowedFields = [
    // Operator info
    "operator_company_name",
    "operator_legal_name",
    "operator_email",
    "operator_phone",
    "operator_billing_address",
    "operator_delivery_address",
    "operator_title",
    // Apex info
    "apex_representative_name",
    "apex_representative_title",
    "apex_representative_email",
    // Equipment
    "machine_model",
    "machine_quantity",
    "machine_unit_price",
    "machine_notes",
    // Location services
    "locations_purchased",
    "location_fee_per_secured",
    "location_rejection_allowance",
    "location_service_timeline_days",
    "location_payment_terms",
    // Shipping / freight
    "standard_freight_rate",
    "discounted_freight_rate",
    "freight_per_machine",
    "shipping_notes",
    "storage_fee_per_machine_month",
    "free_storage_months",
    // Payment
    "payment_due_date",
    "payment_method_notes",
    // Dates / settings
    "effective_date",
    "governing_state",
    "venue_state",
    "contract_expiration_date",
    "internal_notes",
    "customer_notes",
    // Section toggles & auto-invoice
    "include_equipment",
    "include_location_services",
    "include_shipping_storage",
    "auto_send_invoice_on_signing",
    // Legal (admin/director only — already guarded above)
    "legal_overrides",
  ];

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  for (const key of allowedFields) {
    if (key in body) updates[key] = body[key];
  }

  // Auto-recalculate derived fields. Re-fetch current row so unchanged
  // inputs to a computed field don't fall back to 0.
  const { data: current } = await supabaseAdmin
    .from("purchase_agreements")
    .select("machine_quantity, machine_unit_price, freight_per_machine, locations_purchased, location_fee_per_secured, include_equipment, include_location_services, include_shipping_storage")
    .eq("id", id)
    .single();

  const qty = Number(updates.machine_quantity ?? current?.machine_quantity) || 0;
  const unitPrice = Number(updates.machine_unit_price ?? current?.machine_unit_price) || 0;
  const freightPerMachine = Number(updates.freight_per_machine ?? current?.freight_per_machine) || 0;
  const locationsPurchased = Number(updates.locations_purchased ?? current?.locations_purchased) || 0;
  const locationFee = Number(updates.location_fee_per_secured ?? current?.location_fee_per_secured) || 0;

  const includeEquipment = (updates.include_equipment ?? current?.include_equipment) !== false;
  const includeLocationServices = (updates.include_location_services ?? current?.include_location_services) !== false;
  const includeShippingStorage = (updates.include_shipping_storage ?? current?.include_shipping_storage) !== false;

  // Always recalculate so zeroing inputs zeros the subtotal, and so
  // excluded sections contribute nothing to the totals.
  updates.equipment_subtotal = includeEquipment ? qty * unitPrice : 0;
  updates.freight_total = includeShippingStorage ? qty * freightPerMachine : 0;
  updates.max_location_service_value = includeLocationServices ? locationsPurchased * locationFee : 0;

  updates.total_due_prior_to_procurement =
    Number(updates.equipment_subtotal) +
    Number(updates.freight_total) +
    Number(updates.max_location_service_value);

  const { data, error } = await supabaseAdmin
    .from("purchase_agreements")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  // Log activity
  const changedKeys = Object.keys(updates).filter((k) => k !== "updated_at");
  await supabaseAdmin.from("agreement_activity_log").insert({
    agreement_id: id,
    user_id: user.id,
    activity_type: "updated",
    description: `Agreement updated: ${changedKeys.join(", ")}`,
  });

  return NextResponse.json(data);
}

/* ------------------------------------------------------------------ */
/*  DELETE — Delete draft/generated agreement (admin only)            */
/* ------------------------------------------------------------------ */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (user.role !== "admin") {
    return NextResponse.json(
      { error: "Only admins can delete agreements" },
      { status: 403 },
    );
  }

  const { id } = await params;

  // Verify agreement exists and is in deletable status
  const { data: agreement, error: fetchErr } = await supabaseAdmin
    .from("purchase_agreements")
    .select("id, agreement_status")
    .eq("id", id)
    .single();

  if (fetchErr || !agreement)
    return NextResponse.json({ error: "Agreement not found" }, { status: 404 });

  if (!["draft", "generated"].includes(agreement.agreement_status)) {
    return NextResponse.json(
      {
        error: `Cannot delete agreement with status "${agreement.agreement_status}". Only draft or generated agreements can be deleted.`,
      },
      { status: 400 },
    );
  }

  // Delete — cascades to signatures, initials, activity via FK ON DELETE CASCADE
  const { error: delErr } = await supabaseAdmin
    .from("purchase_agreements")
    .delete()
    .eq("id", id);

  if (delErr)
    return NextResponse.json({ error: delErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
