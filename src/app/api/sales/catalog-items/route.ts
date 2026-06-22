import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

export async function GET(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const activeOnly = searchParams.get("active") !== "false";

  let query = supabaseAdmin
    .from("catalog_items")
    .select("*")
    .order("name", { ascending: true });

  if (activeOnly) query = query.eq("active", true);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (user.role !== "admin" && user.role !== "director_of_sales") {
    return NextResponse.json({ error: "Only admins can manage catalog items" }, { status: 403 });
  }

  const body = await req.json();
  const { name, description, item_type, unit_price, sku } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("catalog_items")
    .insert({
      name: name.trim(),
      description: description?.trim() || null,
      item_type: item_type || "other",
      unit_price: Number(unit_price) || 0,
      sku: sku?.trim() || null,
      active: true,
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (user.role !== "admin" && user.role !== "director_of_sales") {
    return NextResponse.json({ error: "Only admins can manage catalog items" }, { status: 403 });
  }

  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  const allowed: Record<string, unknown> = {};
  if ("name" in updates) allowed.name = updates.name;
  if ("description" in updates) allowed.description = updates.description;
  if ("item_type" in updates) allowed.item_type = updates.item_type;
  if ("unit_price" in updates) allowed.unit_price = Number(updates.unit_price) || 0;
  if ("sku" in updates) allowed.sku = updates.sku;
  if ("active" in updates) allowed.active = updates.active;
  allowed.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("catalog_items")
    .update(allowed)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
