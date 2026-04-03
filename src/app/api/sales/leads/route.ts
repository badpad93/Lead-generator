import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

export async function GET(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let query = supabaseAdmin
    .from("sales_leads")
    .select("*, assigned_profile:profiles!assigned_to(full_name, email)")
    .order("created_at", { ascending: false });

  // Sales users only see their own leads
  if (user.role === "sales") {
    query = query.or(`assigned_to.eq.${user.id},assigned_to.is.null`);
  }

  const { data, error } = await query.limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { business_name, contact_name, phone, email, address } = body;
  if (!business_name) return NextResponse.json({ error: "business_name required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("sales_leads")
    .insert({ business_name, contact_name, phone, email, address })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
