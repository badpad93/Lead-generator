import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getOperatorUser, forbidden, getOperatorContractIds } from "@/lib/operatorMarketplaceAuth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOperatorUser(req);
  if (!user) return forbidden();
  const { id } = await params;

  const contractIds = await getOperatorContractIds(user);
  if (contractIds.length === 0) return forbidden("Not found");

  const { data: submission } = await supabaseAdmin
    .from("operator_visible_submissions")
    .select("*")
    .eq("id", id)
    .in("contract_id", contractIds)
    .maybeSingle();
  if (!submission) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: photos } = await supabaseAdmin
    .from("placement_submission_photos")
    .select("id, file_url, file_name, caption")
    .eq("submission_id", id)
    .order("sort_order");

  return NextResponse.json({ submission, photos: photos || [] });
}
