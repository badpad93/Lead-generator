import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getOperatorUser, forbidden, getOperatorContractIds } from "@/lib/operatorMarketplaceAuth";

export async function GET(req: NextRequest) {
  const user = await getOperatorUser(req);
  if (!user) return forbidden();

  const contractIds = await getOperatorContractIds(user);
  if (contractIds.length === 0) return NextResponse.json([]);

  // Use the anonymity view so partner identity never leaks
  const { data, error } = await supabaseAdmin
    .from("operator_visible_submissions")
    .select("*")
    .in("contract_id", contractIds)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}
