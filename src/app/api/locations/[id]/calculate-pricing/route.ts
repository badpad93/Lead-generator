import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser, isElevatedRole } from "@/lib/salesAuth";
import {
  calculateLocationPrice,
  BusinessHours,
  MachinesRequested,
} from "@/lib/pricing/locationPricing";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSalesUser(req);
  if (!user || !isElevatedRole(user.role)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { id: locationId } = await params;
  const body = await req.json();

  const { data: location } = await supabaseAdmin
    .from("locations")
    .select("*")
    .eq("id", locationId)
    .single();

  if (!location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  const employees = body.employees ?? location.employee_count ?? 0;
  const foot_traffic = body.foot_traffic ?? location.traffic_count ?? 0;
  const business_hours: BusinessHours = body.business_hours ?? location.business_hours ?? "low";
  const machines_requested: MachinesRequested = body.machines_requested ?? location.machines_requested ?? 1;

  try {
    const result = calculateLocationPrice({
      employees,
      foot_traffic,
      business_hours,
      machines_requested,
    });

    await supabaseAdmin
      .from("locations")
      .update({
        employee_count: employees,
        traffic_count: foot_traffic,
        business_hours,
        machines_requested,
        pricing_score: result.total_score,
        pricing_tier: result.tier,
        pricing_price: result.price,
        pricing_calculated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", locationId);

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid input";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
