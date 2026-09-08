import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser, isElevatedRole } from "@/lib/salesAuth";
import { assessOrderDeletable, deleteBlockMessage } from "@/lib/orders/deleteGuard";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  // First attempt: full select with profile joins (works if FKs are wired).
  // Falls back gracefully when PostgREST can't resolve relationships.
  let data: Record<string, unknown> | null = null;
  let error: { message: string } | null = null;

  const full = await supabaseAdmin
    .from("sales_orders")
    .select("*, sales_accounts:account_id(*), order_items(*), assigned_profile:assigned_rep_id(full_name, email)")
    .eq("id", id)
    .single();

  if (full.error) {
    // Retry without the assigned_profile join — the FK between sales_orders.assigned_rep_id
    // and profiles may not be declared, which makes PostgREST reject the embed.
    const minimal = await supabaseAdmin
      .from("sales_orders")
      .select("*, sales_accounts:account_id(*), order_items(*)")
      .eq("id", id)
      .single();
    if (minimal.error) {
      error = { message: minimal.error.message };
    } else {
      data = minimal.data as Record<string, unknown>;
      // Manually fetch the assigned rep profile
      const repId = (data as { assigned_rep_id?: string }).assigned_rep_id;
      if (repId) {
        const { data: rep } = await supabaseAdmin
          .from("profiles")
          .select("full_name, email")
          .eq("id", repId)
          .single();
        if (rep) data.assigned_profile = rep;
      }
    }
  } else {
    data = full.data as Record<string, unknown>;
  }

  if (error || !data) return NextResponse.json({ error: error?.message || "Not found" }, { status: 404 });

  // Fetch activity log — also tolerate missing FK on user_id
  let activities: Array<Record<string, unknown>> = [];
  const actFull = await supabaseAdmin
    .from("order_activity_log")
    .select("*, profiles:user_id(full_name)")
    .eq("order_id", id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (actFull.error) {
    const actMin = await supabaseAdmin
      .from("order_activity_log")
      .select("*")
      .eq("order_id", id)
      .order("created_at", { ascending: false })
      .limit(50);
    activities = (actMin.data as Array<Record<string, unknown>>) || [];
  } else {
    activities = (actFull.data as Array<Record<string, unknown>>) || [];
  }

  // Fetch documents
  let documents: Array<Record<string, unknown>> = [];
  const docFull = await supabaseAdmin
    .from("order_documents")
    .select("*, profiles:uploaded_by(full_name)")
    .eq("order_id", id)
    .order("created_at", { ascending: false });
  if (docFull.error) {
    const docMin = await supabaseAdmin
      .from("order_documents")
      .select("*")
      .eq("order_id", id)
      .order("created_at", { ascending: false });
    documents = (docMin.data as Array<Record<string, unknown>>) || [];
  } else {
    documents = (docFull.data as Array<Record<string, unknown>>) || [];
  }

  return NextResponse.json({ ...data, activities, documents });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();

  const allowed = [
    "status", "order_status", "order_type", "notes", "recipient_email",
    "total_value", "deposit_amount", "deposit_paid", "remaining_balance",
    "payment_status", "invoice_status", "agreement_status", "fulfillment_status",
    "next_required_action", "assigned_rep_id",
  ];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  const { data, error } = await supabaseAdmin
    .from("sales_orders")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Log status change if order_status was updated
  if (body.order_status || body.payment_status || body.fulfillment_status) {
    const desc = body._activity_description || `Status updated`;
    await supabaseAdmin.from("order_activity_log").insert({
      order_id: id,
      user_id: user.id,
      activity_type: "status_change",
      description: desc,
    });
  }

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  if (!isElevatedRole(user.role)) {
    return NextResponse.json({ error: "Only admins can delete orders" }, { status: 403 });
  }

  // Gather commercial-history evidence BEFORE deleting anything. Hard
  // deleting a sales_order cascades order_items + order_activity_log away
  // and orphans its purchase_agreements (order_id -> NULL). An order that
  // has been invoiced, paid, or whose agreement the customer has seen must
  // never be silently destroyed this way (this is how Order #108 was lost).
  const { data: order } = await supabaseAdmin
    .from("sales_orders")
    .select("order_status, invoice_status, payment_status, financial_spine_invoice_id")
    .eq("id", id)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const { data: agreements } = await supabaseAdmin
    .from("purchase_agreements")
    .select("agreement_status")
    .eq("order_id", id);

  const { data: invoiceRow } = await supabaseAdmin
    .from("invoices")
    .select("id")
    .eq("order_id", id)
    .limit(1)
    .maybeSingle();

  const assessment = assessOrderDeletable({
    orderStatus: order.order_status,
    invoiceStatus: order.invoice_status,
    paymentStatus: order.payment_status,
    financialSpineInvoiceId: order.financial_spine_invoice_id,
    hasCanonicalInvoiceRow: !!invoiceRow,
    agreementStatuses: (agreements ?? []).map((a) => a.agreement_status as string | null),
  });
  if (!assessment.deletable) {
    return NextResponse.json(
      { error: deleteBlockMessage(assessment.reason as string), reason: assessment.reason },
      { status: 409 },
    );
  }

  await supabaseAdmin.from("sales_documents").delete().eq("order_id", id);
  const { error } = await supabaseAdmin.from("sales_orders").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
