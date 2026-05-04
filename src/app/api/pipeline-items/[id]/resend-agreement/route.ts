import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import { createAndSendAgreement } from "@/lib/locationAgreement";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSalesUser(req);
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id: itemId } = await params;

  console.log("[resend-agreement] Looking up pipeline item:", itemId);

  const { data: item, error: itemError } = await supabaseAdmin
    .from("pipeline_items")
    .select("id, name, location_id")
    .eq("id", itemId)
    .maybeSingle();

  if (itemError) {
    console.error("[resend-agreement] Pipeline item query error:", itemError.message);
    return NextResponse.json({ error: `Query failed: ${itemError.message}` }, { status: 500 });
  }

  if (!item) {
    console.error("[resend-agreement] Pipeline item not found for id:", itemId);
    return NextResponse.json({ error: "Pipeline item not found" }, { status: 404 });
  }

  if (!item.location_id) {
    return NextResponse.json({ error: "No location linked to this pipeline item" }, { status: 422 });
  }

  const { data: loc, error: locError } = await supabaseAdmin
    .from("locations")
    .select("id, sales_lead_id, location_name, decision_maker_name, decision_maker_email, phone, address")
    .eq("id", item.location_id)
    .maybeSingle();

  if (locError || !loc) {
    console.error("[resend-agreement] Location query error:", locError?.message);
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  if (!loc.sales_lead_id) {
    return NextResponse.json({ error: "Location has no linked sales lead — cannot send agreement" }, { status: 422 });
  }

  if (!loc.decision_maker_email) {
    return NextResponse.json({ error: "Location has no decision maker email" }, { status: 422 });
  }

  try {
    await createAndSendAgreement(
      loc.sales_lead_id,
      {
        business_name: loc.location_name || item.name,
        contact_name: loc.decision_maker_name || undefined,
        email: loc.decision_maker_email,
        phone: loc.phone || undefined,
        address: loc.address || undefined,
      },
      { force: true }
    );

    return NextResponse.json({ ok: true, sent_to: loc.decision_maker_email });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[resend-agreement] Failed to send:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
