import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { sendCoffeeApplicationNotification } from "@/lib/coffeeEmail";

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    const { data: application, error } = await supabaseAdmin
      .from("coffee_applications")
      .insert({
        operator_id: userId,
        business_name: body.business_name ?? null,
        contact_name: body.contact_name ?? null,
        email: body.email ?? null,
        phone: body.phone ?? null,
        shipping_address: body.shipping_address ?? null,
        shipping_city: body.shipping_city ?? null,
        shipping_state: body.shipping_state ?? null,
        shipping_zip: body.shipping_zip ?? null,
        num_locations: body.num_locations ?? null,
        existing_machines: body.existing_machines ?? null,
        estimated_volume: body.estimated_volume ?? null,
        notes: body.notes ?? null,
        agreement_signed: body.agreement_signed ?? false,
        agreement_signed_at: body.agreement_signed ? new Date().toISOString() : null,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabaseAdmin
      .from("profiles")
      .update({ coffee_application_status: "pending" })
      .eq("id", userId);

    try {
      await sendCoffeeApplicationNotification({
        businessName: body.business_name || "Unknown",
        contactName: body.contact_name || "Unknown",
        email: body.email || "",
        phone: body.phone,
        numLocations: body.num_locations,
        existingMachines: body.existing_machines,
        estimatedVolume: body.estimated_volume,
      });
    } catch {
      // Email failure should not block the application
    }

    return NextResponse.json({ application }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
