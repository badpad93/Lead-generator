import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser, isElevatedRole } from "@/lib/salesAuth";
import { sanitizeSearch } from "@/lib/sanitizeSearch";
import {
  calculateLocationPrice,
  BusinessHours,
  MachinesRequested,
} from "@/lib/pricing/locationPricing";

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
    const s = sanitizeSearch(search);
    if (s) {
      query = query.or(
        `location_name.ilike.%${s}%,address.ilike.%${s}%,zip.ilike.%${s}%,industry.ilike.%${s}%`
      );
    }
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

  const missing: string[] = [];
  if (!body.industry) missing.push("industry");
  if (!body.zip) missing.push("zip");
  if (!body.employee_count) missing.push("employee_count");
  if (!body.traffic_count) missing.push("traffic_count");
  if (missing.length > 0) {
    return NextResponse.json({ error: `Required fields missing: ${missing.join(", ")}` }, { status: 400 });
  }

  const employees = body.employee_count ? Number(body.employee_count) : null;
  const footTraffic = body.traffic_count ? Number(body.traffic_count) : null;
  const businessHours = body.business_hours || null;
  const machinesRequested = body.machines_requested ? Number(body.machines_requested) : null;

  // Auto-calculate pricing if all required inputs are present
  let pricingFields: Record<string, unknown> = {};
  if (employees != null && businessHours && machinesRequested) {
    try {
      const result = calculateLocationPrice({
        employees,
        foot_traffic: footTraffic ?? 0,
        business_hours: businessHours as BusinessHours,
        machines_requested: machinesRequested as MachinesRequested,
      });
      pricingFields = {
        pricing_score: result.total_score,
        pricing_tier: result.tier,
        pricing_price: result.price,
        pricing_calculated_at: new Date().toISOString(),
      };
    } catch {
      // Invalid pricing inputs — skip auto-calculation
    }
  }

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
      employee_count: employees,
      traffic_count: footTraffic,
      machine_type: body.machine_type || null,
      business_hours: businessHours,
      machines_requested: machinesRequested,
      ...pricingFields,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
