import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "pending";

  let query = supabaseAdmin
    .from("placement_submissions")
    .select("*, contract:contract_id(title, tier, machine_type, market_state, market_city), partner:partner_id(business_name)")
    .order("created_at", { ascending: false });
  if (status !== "all") query = query.eq("admin_status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}
