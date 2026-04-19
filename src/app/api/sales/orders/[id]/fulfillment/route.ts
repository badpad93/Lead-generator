import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id: orderId } = await params;

  const { data, error } = await supabaseAdmin
    .from("fulfillment_items")
    .select("*")
    .eq("order_id", orderId)
    .order("sort_order", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await params;

  const body = await req.json();
  const { item_id, completed } = body;
  if (!item_id) return NextResponse.json({ error: "item_id required" }, { status: 400 });

  const updates: Record<string, unknown> = {
    completed: !!completed,
    completed_at: completed ? new Date().toISOString() : null,
    completed_by: completed ? user.id : null,
  };

  const { data, error } = await supabaseAdmin
    .from("fulfillment_items")
    .update(updates)
    .eq("id", item_id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id: orderId } = await params;

  const body = await req.json();
  const { label } = body;
  if (!label) return NextResponse.json({ error: "label required" }, { status: 400 });

  const { data: existing } = await supabaseAdmin
    .from("fulfillment_items")
    .select("sort_order")
    .eq("order_id", orderId)
    .order("sort_order", { ascending: false })
    .limit(1);

  const nextSort = (existing?.[0]?.sort_order ?? -1) + 1;

  const { data, error } = await supabaseAdmin
    .from("fulfillment_items")
    .insert({ order_id: orderId, label, sort_order: nextSort })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
