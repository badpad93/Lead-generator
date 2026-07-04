import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

/**
 * Admin attribution inspector — list every attribution row grouped by order,
 * optionally filtered by user, locked status, or date range.
 */

export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("user_id");
  const roleCode = searchParams.get("role_code");
  const locked = searchParams.get("locked"); // 'true' | 'false' | null
  const limit = Math.min(500, Math.max(1, Number(searchParams.get("limit") || 200)));

  let query = supabaseAdmin
    .from("sales_attributions")
    .select("*, order:order_id(id, total_value, order_status, payment_status, created_at, assigned_rep_id), user:user_id(full_name, email)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (userId) query = query.eq("user_id", userId);
  if (roleCode) query = query.eq("role_code", roleCode);
  if (locked === "true") query = query.not("locked_at", "is", null);
  else if (locked === "false") query = query.is("locked_at", null);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}
