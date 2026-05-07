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
    return NextResponse.json({ error: "Max 500 items per request" }, { status: 400 });
  }

  // Fetch items to find linked deals
  const { data: items } = await supabaseAdmin
    .from("pipeline_items")
    .select("id, deal_id")
    .in("id", ids);

  const linkedDealIds = (items || [])
    .map((i) => i.deal_id)
    .filter((id): id is string => !!id);

  // Detach/clean up pipeline item FKs
  await Promise.all([
    supabaseAdmin.from("step_approvals").delete().in("pipeline_item_id", ids),
    supabaseAdmin.from("pipeline_item_documents").delete().in("pipeline_item_id", ids),
    supabaseAdmin.from("esign_documents").delete().in("pipeline_item_id", ids),
    supabaseAdmin.from("pipeline_payments").delete().in("pipeline_item_id", ids),
    supabaseAdmin.from("agreement_tokens").delete().in("pipeline_item_id", ids),
    supabaseAdmin.from("sales_deals").update({ pipeline_item_id: null }).in("pipeline_item_id", ids),
  ]);

  // Delete the pipeline items
  const { error: piErr, count: piCount } = await supabaseAdmin
    .from("pipeline_items")
    .delete({ count: "exact" })
    .in("id", ids);

  if (piErr) {
    return NextResponse.json({ error: piErr.message }, { status: 500 });
  }

  // Clean up linked deals
  let dealsDeleted = 0;
  if (linkedDealIds.length > 0) {
    await Promise.all([
      supabaseAdmin.from("sales_orders").update({ deal_id: null }).in("deal_id", linkedDealIds),
      supabaseAdmin.from("sales_commissions").delete().in("deal_id", linkedDealIds),
      supabaseAdmin.from("deal_services").delete().in("deal_id", linkedDealIds),
    ]);

    const { count } = await supabaseAdmin
      .from("sales_deals")
      .delete({ count: "exact" })
      .in("id", linkedDealIds);
    dealsDeleted = count || linkedDealIds.length;
  }

  return NextResponse.json({
    deleted: piCount || ids.length,
    deals_deleted: dealsDeleted,
  });
}
