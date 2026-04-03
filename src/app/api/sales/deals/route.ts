import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

export async function GET(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let query = supabaseAdmin
    .from("sales_deals")
    .select("*, assigned_profile:profiles!assigned_to(full_name, email), deal_services(*)")
    .order("created_at", { ascending: false });

  if (user.role === "sales") {
    query = query.eq("assigned_to", user.id);
  }

  const { data, error } = await query.limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { lead_id, business_name, stage } = body;
  if (!business_name) return NextResponse.json({ error: "business_name required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("sales_deals")
    .insert({
      lead_id: lead_id || null,
      assigned_to: user.id,
      stage: stage || "new",
      value: 0,
      business_name,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
