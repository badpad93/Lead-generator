import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

/**
 * GET /api/admin/marketplace/operators?q=<search>
 *
 * Admin-facing operator search. Used by the contract editor to attach a
 * contract to an operator profile. Matches on business_name / full_name /
 * email / company_name (case-insensitive).
 */
export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit") || 20)));

  let query = supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, company_name, city, state, role")
    .eq("role", "operator")
    .order("full_name", { ascending: true })
    .limit(limit);

  if (q) {
    // Search across the four identity fields with an OR chain.
    query = query.or(
      `full_name.ilike.%${q}%,email.ilike.%${q}%,company_name.ilike.%${q}%`,
    );
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}
