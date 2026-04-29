import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser, isElevatedRole } from "@/lib/salesAuth";
import { filterCommissionsByRole, getRoleLevel } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("user_id");

  let query = supabaseAdmin
    .from("sales_commissions")
    .select("*, sales_deals:deal_id(business_name)")
    .order("created_at", { ascending: false });

  if (userId && getRoleLevel(user.role) <= 2) {
    query = query.eq("user_id", userId);
  } else {
    try {
      query = await filterCommissionsByRole(query, user) as typeof query;
    } catch {
      if (user.role !== "admin" && user.role !== "director_of_sales") {
        return NextResponse.json([]);
      }
    }
  }

  const { data, error } = await query.limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function PATCH(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isElevatedRole(user.role)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await req.json();
  const { id, status, notes } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (status) {
    if (!["pending", "approved", "paid"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    updates.status = status;
    if (status === "paid") updates.paid_at = new Date().toISOString();
  }
  if (notes !== undefined) updates.notes = notes;

  const { data, error } = await supabaseAdmin
    .from("sales_commissions")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
