import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getPlacementPartner } from "@/lib/marketplaceAuth";

export async function GET(req: NextRequest) {
  const pp = await getPlacementPartner(req);
  if (!pp) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: partner } = await supabaseAdmin
    .from("placement_partners")
    .select("dwolla_customer_id, dwolla_funding_source_id, dwolla_verification_status, dwolla_verified_at")
    .eq("id", pp.id)
    .maybeSingle();

  if (!partner) {
    return NextResponse.json({ error: "Placement partner row not found" }, { status: 404 });
  }

  return NextResponse.json({
    has_customer: !!partner.dwolla_customer_id,
    has_funding_source: !!partner.dwolla_funding_source_id,
    verification_status: partner.dwolla_verification_status ?? "unverified",
    verified_at: partner.dwolla_verified_at,
  });
}
