import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

const STATUS_ACTIONS: Record<string, { order_status?: string; payment_status?: string; invoice_status?: string; agreement_status?: string; fulfillment_status?: string; next_action?: string | null }> = {
  send_invoice: { invoice_status: "sent", order_status: "invoice_sent", next_action: "Follow up on payment" },
  send_agreement: { agreement_status: "sent", order_status: "agreement_sent", next_action: "Follow up on signature" },
  mark_agreement_signed: { agreement_status: "signed", order_status: "awaiting_payment", next_action: "Confirm payment" },
  mark_deposit_paid: { payment_status: "deposit_paid", order_status: "deposit_paid", next_action: "Collect remaining balance" },
  mark_paid: { payment_status: "paid", order_status: "paid", next_action: "Order machine from supplier" },
  mark_machine_ordered: { fulfillment_status: "ordered", order_status: "machine_ordered", next_action: "Schedule shipment" },
  mark_location_search: { fulfillment_status: "location_search", order_status: "location_search_active", next_action: "Find and confirm location" },
  mark_coffee_setup: { fulfillment_status: "coffee_setup", order_status: "coffee_program_setup", next_action: "Complete coffee program setup" },
  mark_shipped: { fulfillment_status: "shipped", order_status: "shipped", next_action: "Confirm delivery" },
  mark_delivered: { fulfillment_status: "delivered", order_status: "delivered", next_action: "Mark completed" },
  mark_completed: { fulfillment_status: "completed", order_status: "completed", next_action: null },
  mark_cancelled: { order_status: "cancelled", fulfillment_status: "cancelled", next_action: null },
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();
  const { action } = body;

  const statusUpdate = STATUS_ACTIONS[action];
  if (!statusUpdate) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (statusUpdate.order_status) updates.order_status = statusUpdate.order_status;
  if (statusUpdate.payment_status) updates.payment_status = statusUpdate.payment_status;
  if (statusUpdate.invoice_status) updates.invoice_status = statusUpdate.invoice_status;
  if (statusUpdate.agreement_status) updates.agreement_status = statusUpdate.agreement_status;
  if (statusUpdate.fulfillment_status) updates.fulfillment_status = statusUpdate.fulfillment_status;
  if (statusUpdate.next_action !== undefined) updates.next_required_action = statusUpdate.next_action;

  if (action === "mark_deposit_paid") {
    updates.deposit_paid = true;
  }

  const { data, error } = await supabaseAdmin
    .from("sales_orders")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const description = action.replace(/_/g, " ").replace(/^mark /, "Marked ").replace(/^send /, "Sent ");
  await supabaseAdmin.from("order_activity_log").insert({
    order_id: id,
    user_id: user.id,
    activity_type: "status_change",
    description: description.charAt(0).toUpperCase() + description.slice(1),
  });

  return NextResponse.json(data);
}
