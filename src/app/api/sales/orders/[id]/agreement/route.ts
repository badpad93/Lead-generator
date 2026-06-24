import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

/* ------------------------------------------------------------------ */
/*  POST — Create a purchase agreement from an order                  */
/* ------------------------------------------------------------------ */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id: orderId } = await params;

  // Fetch the order with account and line items
  const { data: order, error: orderErr } = await supabaseAdmin
    .from("sales_orders")
    .select("*, sales_accounts:account_id(*), order_items(*)")
    .eq("id", orderId)
    .single();

  if (orderErr || !order)
    return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const account = order.sales_accounts;
  const items: Array<Record<string, unknown>> = order.order_items || [];

  // Look up the assigned rep's profile
  const { data: repProfile } = await supabaseAdmin
    .from("profiles")
    .select("email, full_name")
    .eq("id", order.assigned_rep_id || order.created_by)
    .single();

  // --- Derive equipment info from order_items ---
  const machineItems = items.filter(
    (i) => i.item_type === "machine_sale",
  );
  const machineQuantity = machineItems.reduce(
    (sum, i) => sum + (Number(i.quantity) || 1),
    0,
  );
  const machineUnitPrice =
    machineItems.length > 0
      ? Number(machineItems[0].unit_price) || Number(machineItems[0].price) || 3700
      : 3700;
  const equipmentSubtotal = machineQuantity * machineUnitPrice;
  const machineModel =
    machineItems.length > 0
      ? String(machineItems[0].service_name || machineItems[0].description || "VendEra AI Machine")
      : "VendEra AI Machine";

  // --- Location services ---
  const locationItems = items.filter(
    (i) => i.item_type === "location_services",
  );
  const locationsPurchased = locationItems.reduce(
    (sum, i) => sum + (Number(i.quantity) || 1),
    0,
  );
  const locationFeePerSecured =
    locationItems.length > 0
      ? Number(locationItems[0].unit_price) || Number(locationItems[0].price) || 400
      : 400;
  const maxLocationServiceValue = locationsPurchased * locationFeePerSecured;

  // --- Freight ---
  const freightPerMachine = 350; // default rate
  const freightTotal = freightPerMachine * machineQuantity;

  // --- Totals ---
  const totalDuePriorToProcurement = equipmentSubtotal + freightTotal;

  const agreementPayload = {
    order_id: orderId,
    account_id: order.account_id || null,
    created_by: user.id,
    agreement_status: "draft",
    agreement_type: "machine_purchase",

    // Operator info from account
    operator_company_name: account?.business_name || "",
    operator_legal_name: account?.contact_name || "",
    operator_email: account?.email || order.recipient_email || "",
    operator_phone: account?.phone || "",
    operator_billing_address: account?.address || "",
    operator_delivery_address: account?.address || "",

    // Apex representative
    apex_representative_name: repProfile?.full_name || "",
    apex_representative_email: repProfile?.email || "",

    // Equipment
    machine_model: machineModel,
    machine_quantity: machineQuantity || 1,
    machine_unit_price: machineUnitPrice,
    equipment_subtotal: equipmentSubtotal,

    // Location services
    locations_purchased: locationsPurchased,
    location_fee_per_secured: locationFeePerSecured,
    max_location_service_value: maxLocationServiceValue,

    // Freight / shipping
    freight_per_machine: freightPerMachine,
    freight_total: freightTotal,

    // Payment
    total_due_prior_to_procurement: totalDuePriorToProcurement,

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

  // Log activity
  await supabaseAdmin.from("agreement_activity_log").insert({
    agreement_id: agreement.id,
    user_id: user.id,
    activity_type: "created",
    description: "Agreement created from order",
  });

  return NextResponse.json(agreement, { status: 201 });
}

/* ------------------------------------------------------------------ */
/*  GET — List agreements for an order                                */
/* ------------------------------------------------------------------ */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id: orderId } = await params;

  const { data: agreements, error } = await supabaseAdmin
    .from("purchase_agreements")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich each agreement with initials/signature counts
  const enriched = await Promise.all(
    (agreements || []).map(async (ag) => {
      const [{ count: initialsCount }, { count: signaturesCount }] =
        await Promise.all([
          supabaseAdmin
            .from("agreement_initials")
            .select("*", { count: "exact", head: true })
            .eq("agreement_id", ag.id),
          supabaseAdmin
            .from("agreement_signatures")
            .select("*", { count: "exact", head: true })
            .eq("agreement_id", ag.id),
        ]);

      return {
        ...ag,
        initials_count: initialsCount ?? 0,
        signatures_count: signaturesCount ?? 0,
      };
    }),
  );

  return NextResponse.json(enriched);
}
