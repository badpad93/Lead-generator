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

  const { data: item } = await supabaseAdmin
    .from("pipeline_items")
    .select("*, locations(sales_lead_id, location_name, decision_maker_name, decision_maker_email, phone, address)")
    .eq("id", itemId)
    .single();

  if (!item) {
    return NextResponse.json({ error: "Pipeline item not found" }, { status: 404 });
  }

  if (!item.location_id || !item.locations) {
    return NextResponse.json({ error: "No location linked" }, { status: 422 });
  }

  const loc = item.locations;
  if (!loc.sales_lead_id) {
    return NextResponse.json({ error: "Location has no linked lead" }, { status: 422 });
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
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
