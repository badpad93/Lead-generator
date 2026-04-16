import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser, isCrmAdmin } from "@/lib/salesAuth";

/** GET /api/sales/goals?user_id=<id> — list goals (sales rep sees own; admin sees any) */
export async function GET(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const targetUserId = url.searchParams.get("user_id") || user.id;

  if (!isCrmAdmin(user) && targetUserId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("sales_goals")
    .select("*")
    .eq("user_id", targetUserId)
    .order("period", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

/** POST /api/sales/goals — admin only. Upsert goal for a user/period. */
export async function POST(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isCrmAdmin(user)) {
    return NextResponse.json({ error: "Only admins can set goals" }, { status: 403 });
  }

  const body = await req.json();
  const { user_id, period, target_revenue, target_deals, target_leads } = body;
  if (!user_id || !period) {
    return NextResponse.json({ error: "user_id and period required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("sales_goals")
    .upsert(
      {
        user_id,
        period,
        target_revenue: Number(target_revenue) || 0,
        target_deals: Number(target_deals) || 0,
        target_leads: Number(target_leads) || 0,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,period" }
    )
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

/** DELETE /api/sales/goals?id=<id> — admin only */
export async function DELETE(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user || !isCrmAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabaseAdmin.from("sales_goals").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
