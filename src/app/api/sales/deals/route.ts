import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser, isCrmAdmin } from "@/lib/salesAuth";

export async function GET(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let query = supabaseAdmin
    .from("sales_deals")
    .select("*, deal_services(*)")
    .order("created_at", { ascending: false });

  if (!isCrmAdmin(user)) {
    query = query.eq("assigned_to", user.id);
  }

  const { data, error } = await query.limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const deals = data || [];
  const ids = Array.from(new Set(deals.map((d) => d.assigned_to).filter(Boolean))) as string[];
  let nameById: Record<string, { full_name: string | null; email: string | null }> = {};
  if (ids.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", ids);
    nameById = Object.fromEntries(
      (profiles || []).map((p) => [p.id, { full_name: p.full_name, email: p.email }])
    );
  }
  const hydrated = deals.map((d) => ({
    ...d,
    assigned_profile: d.assigned_to ? nameById[d.assigned_to] || null : null,
  }));
  return NextResponse.json(hydrated);
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
