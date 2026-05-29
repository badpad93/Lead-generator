import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("coffee_products")
      .select("*, coffee_categories(id, name, slug)")
      .order("sort_order", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ products: data || [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();

    const { data, error } = await supabaseAdmin
      .from("coffee_products")
      .insert({
        category_id: body.category_id ?? null,
        name: body.name,
        sku: body.sku,
        description: body.description ?? null,
        price: body.price,
        shipping_cost: body.shipping_cost ?? 0,
        image_url: body.image_url ?? null,
        stock_status: body.stock_status ?? "in_stock",
        unit: body.unit ?? "each",
        min_order_qty: body.min_order_qty ?? 1,
        active: body.active ?? true,
        sort_order: body.sort_order ?? 0,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ product: data }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { id, ...fields } = body;

    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const allowedFields = [
      "category_id", "name", "sku", "description", "price", "shipping_cost", "image_url",
      "stock_status", "unit", "min_order_qty", "active", "sort_order",
    ];
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const field of allowedFields) {
      if (field in fields) updates[field] = fields[field];
    }

    const { data, error } = await supabaseAdmin
      .from("coffee_products")
      .update(updates)
      .eq("id", id)
      .select("*, coffee_categories(id, name, slug)")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ product: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    // Remove from any carts first
    await supabaseAdmin
      .from("coffee_cart_items")
      .delete()
      .eq("product_id", id);

    // Try hard delete
    const { error } = await supabaseAdmin
      .from("coffee_products")
      .delete()
      .eq("id", id);

    if (error) {
      // Foreign key constraint from order items — soft-delete instead
      const { error: deactivateErr } = await supabaseAdmin
        .from("coffee_products")
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (deactivateErr) {
        return NextResponse.json({ error: deactivateErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, deactivated: true });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
