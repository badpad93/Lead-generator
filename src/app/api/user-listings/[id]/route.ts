import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from("user_listings")
    .select("*, profiles!seller_id(full_name, company_name, city, state)")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  const isAdmin = profile?.role === "admin";

  const { data: listing } = await supabaseAdmin
    .from("user_listings")
    .select("seller_id")
    .eq("id", id)
    .single();

  if (!listing || (!isAdmin && listing.seller_id !== userId)) {
    return NextResponse.json({ error: "Not found or not your listing" }, { status: 404 });
  }

  const body = await req.json();
  const allowed = [
    "title", "description", "price", "city", "state", "zip",
    "entity_type", "foot_traffic", "square_footage", "business_type",
    "contact_name", "contact_phone", "contact_email", "status",
  ];

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  if (updates.price !== undefined) {
    const p = Number(updates.price);
    if (p < 100 || p > 10000) {
      return NextResponse.json({ error: "Price must be between $100 and $10,000" }, { status: 400 });
    }
  }

  const { data, error } = await supabaseAdmin
    .from("user_listings")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  const isAdmin = profile?.role === "admin";

  let query = supabaseAdmin
    .from("user_listings")
    .update({ status: "removed", is_public: false, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (!isAdmin) {
    query = query.eq("seller_id", userId);
  }

  const { data, error } = await query.select("id").single();

  if (error || !data) {
    return NextResponse.json({ error: "Not found or not your listing" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
