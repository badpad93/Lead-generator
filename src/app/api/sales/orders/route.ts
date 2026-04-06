import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

export async function GET(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let query = supabaseAdmin
    .from("sales_orders")
    .select("*, sales_accounts:account_id(business_name), order_items(*)")
    .order("created_at", { ascending: false })
    .limit(200);

  if (user.role === "sales") {
    query = query.eq("created_by", user.id);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

/** POST /api/sales/orders — manually create an order, optionally with items */
export async function POST(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { account_id, deal_id, recipient_email, notes, items } = body;

  type Item = { service_name: string; price?: number; notes?: string };
  const itemList: Item[] = Array.isArray(items) ? items : [];
  const total = itemList.reduce((sum, i) => sum + (Number(i.price) || 0), 0);

  const { data: order, error } = await supabaseAdmin
    .from("sales_orders")
    .insert({
      account_id: account_id || null,
      deal_id: deal_id || null,
      created_by: user.id,
      total_value: total,
      status: "draft",
      recipient_email: recipient_email || null,
      notes: notes || null,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (itemList.length > 0) {
    const rows = itemList
      .filter((i) => i.service_name)
      .map((i) => ({
        order_id: order.id,
        service_name: i.service_name,
        price: Number(i.price) || 0,
        notes: i.notes || null,
      }));
    if (rows.length > 0) {
      await supabaseAdmin.from("order_items").insert(rows);
    }
  }

  return NextResponse.json(order, { status: 201 });
}
