import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

/* ------------------------------------------------------------------ */
/*  POST — Create a sales order from an agreement                     */
/*  Carries all agreement data into the order to prevent variances     */
/* ------------------------------------------------------------------ */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data: ag, error: agErr } = await supabaseAdmin
    .from("purchase_agreements")
    .select("*")
    .eq("id", id)
    .single();

  if (agErr || !ag)
    return NextResponse.json({ error: "Agreement not found" }, { status: 404 });

  // Respect section toggles when building line items
  const includeEquipment = ag.include_equipment !== false;
  const includeLocationServices = ag.include_location_services !== false;
  const includeShippingStorage = ag.include_shipping_storage !== false;

  const items: Array<Record<string, unknown>> = [];

  // Machine sale item
  if (includeEquipment && ag.machine_quantity > 0 && Number(ag.machine_unit_price) > 0) {
    const unitPrice = Number(ag.machine_unit_price) || 0;
    const qty = Number(ag.machine_quantity) || 1;
    items.push({
      item_type: "machine_sale",
      service_name: ag.machine_model || "VendEra AI Machine",
      description: ag.machine_notes || null,
      quantity: qty,
      unit_price: unitPrice,
      price: unitPrice,
      total_price: qty * unitPrice,
      discount_percent: 0,
      status: "pending",
      deposit_required: false,
    });
  }

  // Location services item — split into deposit + remaining when deposit-only is on
  if (includeLocationServices && Number(ag.locations_purchased) > 0) {
    const locFee = Number(ag.location_fee_per_secured) || 0;
    const locQty = Number(ag.locations_purchased) || 0;
    const locTotal = locQty * locFee;
    const depositOnly = ag.location_services_deposit_only === true;
    const deposit = depositOnly ? Math.min(Number(ag.location_services_deposit_amount) || 0, locTotal) : locTotal;
    const remaining = depositOnly ? Math.max(0, locTotal - deposit) : 0;

    if (depositOnly) {
      items.push({
        item_type: "location_services",
        service_name: "Location Services Deposit",
        description: `Non-refundable deposit for ${locQty} location${locQty === 1 ? "" : "s"} ($${locFee.toFixed(2)} each, $${locTotal.toFixed(2)} total). Balance of $${remaining.toFixed(2)} due on fulfillment.`,
        quantity: 1,
        unit_price: deposit,
        price: deposit,
        total_price: deposit,
        discount_percent: 0,
        status: "pending",
        deposit_required: false,
      });
      if (remaining > 0) {
        items.push({
          item_type: "location_services",
          service_name: "Location Services Remaining Balance",
          description: `Balance due after fulfillment of secured locations. Invoiced upon completion.`,
          quantity: 1,
          unit_price: remaining,
          price: remaining,
          total_price: remaining,
          discount_percent: 0,
          status: "pending_fulfillment",
          deposit_required: false,
        });
      }
    } else {
      items.push({
        item_type: "location_services",
        service_name: "Location Sourcing & Placement",
        description: `${locQty} locations at $${locFee.toFixed(2)} each. Timeline: ${ag.location_service_timeline_days || 180} days.`,
        quantity: locQty,
        unit_price: locFee,
        price: locFee,
        total_price: locTotal,
        discount_percent: 0,
        status: "pending",
        location_service_price: locTotal,
        deposit_required: false,
      });
    }
  }

  // Freight item (if freight > 0 and shipping included)
  const freightTotal = Number(ag.freight_total) || 0;
  if (includeShippingStorage && freightTotal > 0) {
    items.push({
      item_type: "other",
      service_name: "Shipping & Freight",
      description: `${ag.machine_quantity || 1} machine(s) at $${(Number(ag.freight_per_machine) || 0).toFixed(2)} each`,
      quantity: 1,
      unit_price: freightTotal,
      price: freightTotal,
      total_price: freightTotal,
      discount_percent: 0,
      status: "pending",
      deposit_required: false,
    });
  }

  // Upfront total excludes the deferred location-services balance.
  const totalValue = items
    .filter((i) => i.status !== "pending_fulfillment")
    .reduce((sum, i) => sum + (Number(i.total_price) || 0), 0);

  // Create the order
  const { data: order, error: orderErr } = await supabaseAdmin
    .from("sales_orders")
    .insert({
      account_id: ag.account_id || null,
      lead_id: null,
      deal_id: null,
      created_by: user.id,
      assigned_rep_id: ag.created_by || user.id,
      total_value: totalValue,
      status: "draft",
      order_status: "draft",
      document_type: "order",
      order_type: "machine_purchase",
      deposit_amount: 0,
      deposit_paid: false,
      remaining_balance: totalValue,
      payment_status: "unpaid",
      invoice_status: "not_sent",
      agreement_status: ag.agreement_status === "signed" ? "signed" : "not_sent",
      fulfillment_status: "pending",
      next_required_action: ag.agreement_status === "signed"
        ? "Send invoice for payment"
        : "Agreement pending signature",
      recipient_email: ag.operator_email || null,
      notes: `Created from agreement. Operator: ${ag.operator_company_name || ""}. ${ag.machine_quantity || 1}x ${ag.machine_model || "VendEra AI Machine"}.`,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (orderErr)
    return NextResponse.json({ error: orderErr.message }, { status: 500 });

  // Insert order items
  if (items.length > 0) {
    const orderItems = items.map((item) => ({
      order_id: order.id,
      ...item,
      location_deposit_paid: false,
    }));

    await supabaseAdmin.from("order_items").insert(orderItems);
  }

  // Link the agreement to this order
  await supabaseAdmin
    .from("purchase_agreements")
    .update({ order_id: order.id, updated_at: new Date().toISOString() })
    .eq("id", ag.id);

  // Log activity on the agreement
  await supabaseAdmin.from("agreement_activity_log").insert({
    agreement_id: ag.id,
    user_id: user.id,
    activity_type: "order_created",
    description: `Order created from agreement — Order #${order.order_number || order.id.slice(0, 6)}`,
  });

  return NextResponse.json({ order_id: order.id, order_number: order.order_number }, { status: 201 });
}
