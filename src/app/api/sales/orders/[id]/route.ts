import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser, isElevatedRole } from "@/lib/salesAuth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from("sales_orders")
    .select("*, sales_accounts:account_id(*), order_items(*), assigned_profile:assigned_rep_id(full_name, email)")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  // Fetch activity log
  const { data: activities } = await supabaseAdmin
    .from("order_activity_log")
    .select("*, profiles:user_id(full_name)")
    .eq("order_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  // Fetch documents
  const { data: documents } = await supabaseAdmin
    .from("order_documents")
    .select("*, profiles:uploaded_by(full_name)")
    .eq("order_id", id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ ...data, activities: activities || [], documents: documents || [] });
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

  await supabaseAdmin.from("sales_documents").delete().eq("order_id", id);
  const { error } = await supabaseAdmin.from("sales_orders").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
