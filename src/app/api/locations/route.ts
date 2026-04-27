import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser, isElevatedRole } from "@/lib/salesAuth";

export async function GET(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user || !isElevatedRole(user.role)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";

  let query = supabaseAdmin
    .from("locations")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (search) {
    query = query.or(
      `location_name.ilike.%${search}%,address.ilike.%${search}%,zip.ilike.%${search}%,industry.ilike.%${search}%`
    );
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user || !isElevatedRole(user.role)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await req.json();

  const { data, error } = await supabaseAdmin
    .from("locations")
    .insert({
      location_name: body.location_name || null,
      address: body.address || null,
      phone: body.phone || null,
      decision_maker_name: body.decision_maker_name || null,
      decision_maker_email: body.decision_maker_email || null,
      industry: body.industry || null,
      zip: body.zip || null,
      employee_count: body.employee_count ? Number(body.employee_count) : null,
      traffic_count: body.traffic_count ? Number(body.traffic_count) : null,
      machine_type: body.machine_type || null,
      business_hours: body.business_hours || null,
      machines_requested: body.machines_requested ? Number(body.machines_requested) : null,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
