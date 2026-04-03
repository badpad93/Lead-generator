import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id: dealId } = await params;
  const body = await req.json();

  const { service_name, price, status } = body;
  if (!service_name) return NextResponse.json({ error: "service_name required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("deal_services")
    .insert({ deal_id: dealId, service_name, price: price || 0, status: status || "pending" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Recalculate deal value
  await recalcDealValue(dealId);

  return NextResponse.json(data, { status: 201 });
}

async function recalcDealValue(dealId: string) {
  const { data: services } = await supabaseAdmin
    .from("deal_services")
    .select("price")
    .eq("deal_id", dealId);

  const total = (services || []).reduce((sum, s) => sum + Number(s.price), 0);
  await supabaseAdmin.from("sales_deals").update({ value: total }).eq("id", dealId);
}
