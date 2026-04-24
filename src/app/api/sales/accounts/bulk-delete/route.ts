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
    return NextResponse.json({ error: "Max 500 accounts per request" }, { status: 400 });
  }

  // Detach linked records so FK constraints don't block the delete
  await Promise.all([
    supabaseAdmin.from("sales_leads").update({ account_id: null }).in("account_id", ids),
    supabaseAdmin.from("sales_deals").update({ account_id: null }).in("account_id", ids),
    supabaseAdmin.from("sales_orders").update({ account_id: null }).in("account_id", ids),
  ]);
  await supabaseAdmin.from("sales_documents").delete().in("account_id", ids);

  const { error, count } = await supabaseAdmin
    .from("sales_accounts")
    .delete({ count: "exact" })
    .in("id", ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: count || ids.length });
}
