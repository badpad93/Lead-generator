import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/coffee/guest-track/[token] — read-only order status for a
 * guest whose only credential is the tracking token we emailed them.
 * No auth required. Returns just the order snapshot + line items +
 * shipping/billing summary + latest workflow status — never any
 * cross-account data.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const { data: session } = await supabaseAdmin
    .from("guest_checkout_sessions")
    .select("id, email, coffee_order_id, workflow_id, tracking_token_expires_at, provisioned_user_id, claimed_at")
    .eq("tracking_token", token)
    .maybeSingle();

  if (!session) {
    return NextResponse.json({ error: "Tracking link not found." }, { status: 404 });
  }
  if (new Date(session.tracking_token_expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "This tracking link has expired." }, { status: 410 });
  }
  if (!session.coffee_order_id) {
    return NextResponse.json({ error: "No order associated with this link." }, { status: 404 });
  }

  const { data: order } = await supabaseAdmin
    .from("coffee_orders")
    .select("*")
    .eq("id", session.coffee_order_id)
    .maybeSingle();

  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const { data: items } = await supabaseAdmin
    .from("coffee_order_items")
    .select("id, product_name, product_sku, quantity, unit_price, line_total")
    .eq("order_id", order.id);

  let workflow: {
    id: string;
    overall_status: string;
    current_stage_key: string | null;
    stages: Array<{ key: string; name: string; status: string; completed_quantity: number | null; target_quantity: number | null }>;
  } | null = null;

  if (session.workflow_id) {
    const { data: wf } = await supabaseAdmin
      .from("workflows")
      .select("id, overall_status, current_stage_key")
      .eq("id", session.workflow_id)
      .maybeSingle();
    if (wf) {
      const { data: stages } = await supabaseAdmin
        .from("workflow_stages")
        .select("stage_key, name, status, completed_quantity, target_quantity, order_index")
        .eq("workflow_id", wf.id)
        .order("order_index", { ascending: true });
      workflow = {
        id: wf.id,
        overall_status: wf.overall_status,
        current_stage_key: wf.current_stage_key,
        stages: (stages ?? []).map((s) => ({
          key: s.stage_key,
          name: s.name,
          status: s.status,
          completed_quantity: s.completed_quantity,
          target_quantity: s.target_quantity,
        })),
      };
    }
  }

  return NextResponse.json({
    email: session.email,
    claimed: !!session.claimed_at,
    order: {
      id: order.id,
      order_number: order.order_number,
      status: order.status,
      subtotal: order.subtotal,
      shipping_estimate: order.shipping_estimate,
      total: order.total,
      created_at: order.created_at,
      shipping: {
        business_name: order.shipping_business_name,
        contact_name: order.shipping_name,
        address: order.shipping_address,
        city: order.shipping_city,
        state: order.shipping_state,
        zip: order.shipping_zip,
        phone: order.shipping_phone,
      },
      billing: {
        business_name: order.billing_business_name,
        contact_name: order.billing_contact_name,
        email: order.billing_email,
        phone: order.billing_phone,
      },
      items: items ?? [],
    },
    workflow,
  });
}
