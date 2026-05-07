import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser, isElevatedRole } from "@/lib/salesAuth";

export async function POST(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user || !isElevatedRole(user.role)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await req.json();
  const { ids } = body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids array required" }, { status: 400 });
  }

  if (ids.length > 500) {
    return NextResponse.json({ error: "Max 500 deals per request" }, { status: 400 });
  }

  // Detach FKs before deletion
  await Promise.all([
    supabaseAdmin.from("sales_orders").update({ deal_id: null }).in("deal_id", ids),
    supabaseAdmin.from("sales_commissions").delete().in("deal_id", ids),
    supabaseAdmin.from("deal_services").delete().in("deal_id", ids),
    supabaseAdmin.from("pipeline_items").update({ deal_id: null }).in("deal_id", ids),
  ]);

  const { error, count } = await supabaseAdmin
    .from("sales_deals")
    .delete({ count: "exact" })
    .in("id", ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: count || ids.length });
}
