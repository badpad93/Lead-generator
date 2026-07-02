import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getPlacementPartner, forbidden } from "@/lib/marketplaceAuth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPlacementPartner(req);
  if (!user) return forbidden();
  const { id } = await params;

  const { data: submission } = await supabaseAdmin
    .from("placement_submissions")
    .select("*, placement_contracts:contract_id(title, tier, partner_payout, machine_type, market_state, market_city)")
    .eq("id", id)
    .eq("partner_id", user.id)
    .maybeSingle();
  if (!submission) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [{ data: photos }, { data: activity }] = await Promise.all([
    supabaseAdmin.from("placement_submission_photos").select("*").eq("submission_id", id).order("sort_order"),
    supabaseAdmin.from("placement_submission_activity").select("*").eq("submission_id", id).order("created_at", { ascending: false }),
  ]);

  return NextResponse.json({ submission, photos: photos || [], activity: activity || [] });
}
