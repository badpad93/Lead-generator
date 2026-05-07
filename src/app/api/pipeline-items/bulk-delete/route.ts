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

  // Exclude won/lost items to preserve stats
  const { data: items } = await supabaseAdmin
    .from("pipeline_items")
    .select("id, status, deal_id")
    .in("id", ids);

  const protectedIds = new Set(
    (items || []).filter((i) => i.status === "won" || i.status === "lost").map((i) => i.id)
  );
  const deletableItems = (items || []).filter((i) => !protectedIds.has(i.id));
  const deletableIds = deletableItems.map((i) => i.id);

  if (deletableIds.length === 0) {
    return NextResponse.json({
      deleted: 0,
      skipped: protectedIds.size,
      message: "All selected items are won/lost and were skipped to preserve stats.",
    });
  }

  // Also delete linked deals (that aren't won/lost)
  const linkedDealIds = deletableItems
    .map((i) => i.deal_id)
    .filter((id): id is string => !!id);

  // Detach/clean up pipeline item FKs
  await Promise.all([
    supabaseAdmin.from("step_approvals").delete().in("pipeline_item_id", deletableIds),
    supabaseAdmin.from("pipeline_item_documents").delete().in("pipeline_item_id", deletableIds),
    supabaseAdmin.from("esign_documents").delete().in("pipeline_item_id", deletableIds),
    supabaseAdmin.from("pipeline_payments").delete().in("pipeline_item_id", deletableIds),
    supabaseAdmin.from("agreement_tokens").delete().in("pipeline_item_id", deletableIds),
    supabaseAdmin.from("sales_deals").update({ pipeline_item_id: null }).in("pipeline_item_id", deletableIds),
  ]);

  // Delete the pipeline items
  const { error: piErr, count: piCount } = await supabaseAdmin
    .from("pipeline_items")
    .delete({ count: "exact" })
    .in("id", deletableIds);

  if (piErr) {
    return NextResponse.json({ error: piErr.message }, { status: 500 });
  }

  // Clean up linked deals (skip won/lost)
  let dealsDeleted = 0;
  if (linkedDealIds.length > 0) {
    const { data: linkedDeals } = await supabaseAdmin
      .from("sales_deals")
      .select("id, stage")
      .in("id", linkedDealIds);

    const deletableDealIds = (linkedDeals || [])
      .filter((d) => d.stage !== "won" && d.stage !== "lost")
      .map((d) => d.id);

    if (deletableDealIds.length > 0) {
      await Promise.all([
        supabaseAdmin.from("sales_orders").update({ deal_id: null }).in("deal_id", deletableDealIds),
        supabaseAdmin.from("sales_commissions").delete().in("deal_id", deletableDealIds),
        supabaseAdmin.from("deal_services").delete().in("deal_id", deletableDealIds),
      ]);

      const { count } = await supabaseAdmin
        .from("sales_deals")
        .delete({ count: "exact" })
        .in("id", deletableDealIds);
      dealsDeleted = count || deletableDealIds.length;
    }
  }

  return NextResponse.json({
    deleted: piCount || deletableIds.length,
    deals_deleted: dealsDeleted,
    skipped: protectedIds.size,
  });
}
