import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import { buildOrderItemsFromAgreement } from "@/lib/agreements/sync";
import { orderTotals } from "@/lib/pricing/lineItems";

/* ------------------------------------------------------------------ */
/*  POST — Create a sales order from an agreement                     */
/* ------------------------------------------------------------------ */
/**
 * Rebuilds the order from the agreement's line_items_snapshot, so every
 * line comes back exactly as it went in. The previous version
 * reconstructed only machine / location / freight lines from scalar
 * columns with discount_percent hardcoded to 0, which meant a round
 * trip through an agreement permanently deleted coffee, cooler and
 * financing lines and flattened every discount.
 *
 * Refuses when the agreement is already linked to an order. Previously
 * a second call silently re-pointed purchase_agreements.order_id at a
 * new order and orphaned the first one.
 */
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

  if (ag.order_id) {
    const { data: linked } = await supabaseAdmin
      .from("sales_orders")
      .select("id, order_number")
      .eq("id", ag.order_id)
      .maybeSingle();
    return NextResponse.json(
      {
        error: `This agreement is already linked to order #${linked?.order_number ?? ag.order_id}.`,
        code: "ALREADY_LINKED",
        order_id: ag.order_id,
        order_number: linked?.order_number ?? null,
      },
      { status: 409 },
    );
  }

  const items = buildOrderItemsFromAgreement(ag);
  if (items.length === 0) {
    return NextResponse.json(
      { error: "This agreement has no line items to build an order from." },
      { status: 400 },
    );
  }

  const totals = orderTotals(items);

  // A signed agreement is already the customer's commitment, so the
  // order opens in awaiting_payment rather than draft.
  const startsSigned = ag.agreement_status === "signed";

  const { data: order, error: orderErr } = await supabaseAdmin
    .from("sales_orders")
    .insert({
      account_id: ag.account_id || null,
      lead_id: null,
      deal_id: null,
      created_by: user.id,
      assigned_rep_id: ag.created_by || user.id,
      total_value: totals.upfrontTotal,
      status: "draft",
      order_status: startsSigned ? "awaiting_payment" : "draft",
      document_type: "order",
      order_type: "machine_purchase",
      deposit_amount: totals.depositTotal,
      deposit_paid: false,
      remaining_balance: totals.upfrontTotal,
      payment_status: "unpaid",
      invoice_status: "not_sent",
      agreement_status: startsSigned ? "signed" : "not_sent",
      fulfillment_status: "pending",
      next_required_action: startsSigned
        ? "Send invoice for payment"
        : "Agreement pending signature",
      recipient_email: ag.operator_email || null,
      notes: `Created from agreement. Operator: ${ag.operator_company_name || ""}. ${items.length} line item${items.length === 1 ? "" : "s"}.`,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (orderErr)
    return NextResponse.json({ error: orderErr.message }, { status: 500 });

  const { error: itemsErr } = await supabaseAdmin
    .from("order_items")
    .insert(items.map((item) => ({ order_id: order.id, ...item })));

  if (itemsErr) {
    // Don't leave a headless order behind if the lines failed.
    await supabaseAdmin.from("sales_orders").delete().eq("id", order.id);
    return NextResponse.json(
      { error: `Could not copy line items onto the order: ${itemsErr.message}` },
      { status: 500 },
    );
  }

  await supabaseAdmin
    .from("purchase_agreements")
    .update({ order_id: order.id, updated_at: new Date().toISOString() })
    .eq("id", ag.id);

  await supabaseAdmin.from("agreement_activity_log").insert({
    agreement_id: ag.id,
    user_id: user.id,
    activity_type: "order_created",
    description: `Order created from agreement — Order #${order.order_number || order.id.slice(0, 6)}, ${items.length} line item${items.length === 1 ? "" : "s"}`,
  });

  if (startsSigned) {
    try {
      const { sendInvoiceForSignedAgreement } = await import("@/lib/agreementInvoicing");
      const result = await sendInvoiceForSignedAgreement(ag.id);
      if (!result.ok) {
        await supabaseAdmin.from("agreement_activity_log").insert({
          agreement_id: ag.id,
          user_id: user.id,
          activity_type: "auto_invoice_failed",
          description: `Auto-invoice after order-from-agreement failed: ${result.reason ?? "unknown"}`,
        });
      }
    } catch (e) {
      console.error("[create-order] auto-invoice failed (non-fatal):", e);
    }
  }

  return NextResponse.json(
    { order_id: order.id, order_number: order.order_number },
    { status: 201 },
  );
}
