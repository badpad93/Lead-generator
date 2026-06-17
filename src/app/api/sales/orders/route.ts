import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

export async function GET(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const search = searchParams.get("search");

  let query = supabaseAdmin
    .from("sales_orders")
    .select("*, sales_accounts:account_id(id, business_name, contact_name, email, phone), order_items(*), assigned_profile:assigned_rep_id(full_name)")
    .order("created_at", { ascending: false })
    .limit(200);

  if (user.role === "sales") {
    query = query.or(`created_by.eq.${user.id},assigned_rep_id.eq.${user.id}`);
  }

  if (status && status !== "all") {
    query = query.eq("order_status", status);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let results = data || [];

  if (search) {
    const s = search.toLowerCase();
    results = results.filter((o: Record<string, unknown>) => {
      const acct = o.sales_accounts as { business_name?: string; contact_name?: string } | null;
      const orderNum = String(o.order_number || "");
      return (
        acct?.business_name?.toLowerCase().includes(s) ||
        acct?.contact_name?.toLowerCase().includes(s) ||
        orderNum.includes(s) ||
        (o.id as string).toLowerCase().includes(s)
      );
    });
  }

  return NextResponse.json(results);
}

export async function POST(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const {
    account_id, lead_id, deal_id, recipient_email, notes, items,
    order_type, next_required_action, assigned_rep_id,
  } = body;

  type Item = {
    item_type?: string;
    item_name?: string;
    service_name?: string;
    description?: string;
    quantity?: number;
    unit_price?: number;
    price?: number;
    location_service_price?: number;
    deposit_required?: boolean;
    location_deposit_amount?: number;
  };
  const itemList: Item[] = Array.isArray(items) ? items : [];
  const total = itemList.reduce((sum, i) => {
    const qty = Number(i.quantity) || 1;
    const price = Number(i.unit_price || i.price) || 0;
    return sum + qty * price;
  }, 0);

  const depositTotal = itemList.reduce((sum, i) => {
    if (i.deposit_required && i.location_deposit_amount) {
      return sum + Number(i.location_deposit_amount);
    }
    return sum;
  }, 0);

  const { data: order, error } = await supabaseAdmin
    .from("sales_orders")
    .insert({
      account_id: account_id || null,
      lead_id: lead_id || null,
      deal_id: deal_id || null,
      created_by: user.id,
      assigned_rep_id: assigned_rep_id || user.id,
      total_value: total,
      status: "draft",
      order_status: "draft",
      order_type: order_type || null,
      deposit_amount: depositTotal,
      deposit_paid: false,
      remaining_balance: total,
      payment_status: "unpaid",
      invoice_status: "not_sent",
      agreement_status: "not_sent",
      fulfillment_status: "pending",
      next_required_action: next_required_action || "Collect customer business information",
      recipient_email: recipient_email || null,
      notes: notes || null,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (itemList.length > 0) {
    const rows = itemList
      .filter((i) => i.item_name || i.service_name)
      .map((i) => {
        const qty = Number(i.quantity) || 1;
        const unitPrice = Number(i.unit_price || i.price) || 0;
        return {
          order_id: order.id,
          service_name: i.item_name || i.service_name || "",
          price: unitPrice,
          item_type: i.item_type || "other",
          description: i.description || null,
          quantity: qty,
          unit_price: unitPrice,
          total_price: qty * unitPrice,
          status: "pending",
          location_service_price: i.location_service_price || null,
          deposit_required: i.deposit_required || false,
          location_deposit_amount: i.location_deposit_amount || null,
          location_deposit_paid: false,
          location_remaining_balance: i.location_service_price
            ? (i.location_service_price - (i.location_deposit_amount || 0))
            : null,
        };
      });
    if (rows.length > 0) {
      await supabaseAdmin.from("order_items").insert(rows);
    }
  }

  // Log creation activity
  await supabaseAdmin.from("order_activity_log").insert({
    order_id: order.id,
    user_id: user.id,
    activity_type: "created",
    description: "Order created",
  });

  return NextResponse.json(order, { status: 201 });
}
