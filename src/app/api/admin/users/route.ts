import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";
import { sanitizeSearch } from "@/lib/sanitizeSearch";

/** GET /api/admin/users — list all user profiles (admin view) */
export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const search = url.searchParams.get("search") || "";
  const role = url.searchParams.get("role") || "";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 1000);
  const offset = parseInt(url.searchParams.get("offset") || "0");

  // Build the query. deleted_at filter is attempted first; when the
  // column doesn't exist (migration 163 not yet run) we retry without
  // it so the admin panel never renders empty just because a schema
  // change is pending.
  function build(withDeletedFilter: boolean) {
    let q = supabaseAdmin
      .from("profiles")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (withDeletedFilter) q = q.is("deleted_at", null);
    if (search) {
      const s = sanitizeSearch(search);
      if (s) q = q.or(`full_name.ilike.%${s}%,email.ilike.%${s}%`);
    }
    if (role) q = q.eq("role", role);
    return q;
  }

  let { data, error, count } = await build(true);
  if (error && /deleted_at/i.test(error.message)) {
    ({ data, error, count } = await build(false));
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ users: data || [], total: count || 0 });
}
