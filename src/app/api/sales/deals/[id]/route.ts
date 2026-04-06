import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from("sales_deals")
    .select("*, deal_services(*)")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();

  const allowed = ["stage", "value", "business_name", "account_id"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  // If stage → won, auto-create account
  if (body.stage === "won") {
    const { data: deal } = await supabaseAdmin
      .from("sales_deals")
      .select("*, sales_leads:lead_id(*)")
      .eq("id", id)
      .single();

    if (deal && !deal.account_id) {
      const lead = deal.sales_leads;
      const { data: account } = await supabaseAdmin
        .from("sales_accounts")
        .insert({
          business_name: deal.business_name,
          contact_name: lead?.contact_name || null,
          phone: lead?.phone || null,
          email: lead?.email || null,
          address: lead?.address || null,
        })
        .select("id")
        .single();

      if (account) {
        updates.account_id = account.id;
      }
    }
  }

  const { data, error } = await supabaseAdmin
    .from("sales_deals")
    .update(updates)
    .eq("id", id)
    .select("*, deal_services(*)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  if (user.role !== "admin") {
    const { data: deal } = await supabaseAdmin
      .from("sales_deals")
      .select("assigned_to")
      .eq("id", id)
      .single();
    if (!deal || deal.assigned_to !== user.id) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }
  }

  // Detach orders so the FK doesn't block deletion
  await supabaseAdmin.from("sales_orders").update({ deal_id: null }).eq("deal_id", id);

  const { error } = await supabaseAdmin.from("sales_deals").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
