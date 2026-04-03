import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; serviceId: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id: dealId, serviceId } = await params;
  const body = await req.json();

  const allowed = ["service_name", "price", "status"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  const { data, error } = await supabaseAdmin
    .from("deal_services")
    .update(updates)
    .eq("id", serviceId)
    .eq("deal_id", dealId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Recalculate deal value
  const { data: services } = await supabaseAdmin
    .from("deal_services")
    .select("price")
    .eq("deal_id", dealId);
  const total = (services || []).reduce((sum, s) => sum + Number(s.price), 0);
  await supabaseAdmin.from("sales_deals").update({ value: total }).eq("id", dealId);

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; serviceId: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id: dealId, serviceId } = await params;

  const { error } = await supabaseAdmin
    .from("deal_services")
    .delete()
    .eq("id", serviceId)
    .eq("deal_id", dealId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Recalculate deal value
  const { data: services } = await supabaseAdmin
    .from("deal_services")
    .select("price")
    .eq("deal_id", dealId);
  const total = (services || []).reduce((sum, s) => sum + Number(s.price), 0);
  await supabaseAdmin.from("sales_deals").update({ value: total }).eq("id", dealId);

  return NextResponse.json({ ok: true });
}
