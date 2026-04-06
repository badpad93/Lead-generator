import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  // Fetch account with related leads, deals, orders, documents
  const [accountRes, leadsRes, dealsRes, ordersRes, docsRes] = await Promise.all([
    supabaseAdmin.from("sales_accounts").select("*").eq("id", id).single(),
    supabaseAdmin.from("sales_leads").select("*").eq("account_id", id).order("created_at", { ascending: false }),
    supabaseAdmin.from("sales_deals").select("*, deal_services(*)").eq("account_id", id).order("created_at", { ascending: false }),
    supabaseAdmin.from("sales_orders").select("*, order_items(*)").eq("account_id", id).order("created_at", { ascending: false }),
    supabaseAdmin.from("sales_documents").select("*").eq("account_id", id).order("created_at", { ascending: false }),
  ]);

  if (accountRes.error) return NextResponse.json({ error: accountRes.error.message }, { status: 404 });

  return NextResponse.json({
    ...accountRes.data,
    leads: leadsRes.data || [],
    deals: dealsRes.data || [],
    orders: ordersRes.data || [],
    documents: docsRes.data || [],
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();

  const allowed = ["business_name", "contact_name", "phone", "email", "address", "notes", "assigned_to"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  const { data, error } = await supabaseAdmin
    .from("sales_accounts")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  // Sales reps can only delete accounts they own; admins can delete any.
  if (user.role !== "admin") {
    const { data: acct } = await supabaseAdmin
      .from("sales_accounts")
      .select("assigned_to, created_by")
      .eq("id", id)
      .single();
    if (!acct || (acct.assigned_to !== user.id && acct.created_by !== user.id)) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }
  }

  // Detach related records so FK constraints don't block the delete.
  // Leads, deals, and orders survive but lose their account link.
  await supabaseAdmin.from("sales_leads").update({ account_id: null }).eq("account_id", id);
  await supabaseAdmin.from("sales_deals").update({ account_id: null }).eq("account_id", id);
  await supabaseAdmin.from("sales_orders").update({ account_id: null }).eq("account_id", id);
  await supabaseAdmin.from("sales_documents").delete().eq("account_id", id);

  const { error } = await supabaseAdmin.from("sales_accounts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
