import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const status = req.nextUrl.searchParams.get("status") || "all";

  let query = supabaseAdmin
    .from("user_listing_purchases")
    .select("*, user_listings(title, listing_type, city, state), buyer:profiles!buyer_id(full_name, email), seller:profiles!seller_id(full_name, email, payout_method, payout_email, payout_bank_name, payout_routing_number, payout_account_number, payout_notes)")
    .eq("status", "completed")
    .order("created_at", { ascending: false });

  if (status !== "all") {
    query = query.eq("payout_status", status);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ payouts: data || [] });
}

export async function PATCH(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const body = await req.json();
  const { purchase_id, payout_status, payout_method, payout_reference } = body;

  if (!purchase_id || !payout_status) {
    return NextResponse.json({ error: "purchase_id and payout_status required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    payout_status,
    updated_at: new Date().toISOString(),
  };
  if (payout_method) updates.payout_method = payout_method;
  if (payout_reference) updates.payout_reference = payout_reference;
  if (payout_status === "completed") updates.payout_completed_at = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from("user_listing_purchases")
    .update(updates)
    .eq("id", purchase_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
