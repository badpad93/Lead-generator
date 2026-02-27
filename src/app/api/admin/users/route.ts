import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

/** GET /api/admin/users — list all user profiles (admin view) */
export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const search = url.searchParams.get("search") || "";
  const role = url.searchParams.get("role") || "";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);
  const offset = parseInt(url.searchParams.get("offset") || "0");

  let query = supabaseAdmin
    .from("profiles")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
  }

  if (role) {
    query = query.eq("role", role);
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ users: data || [], total: count || 0 });
}
