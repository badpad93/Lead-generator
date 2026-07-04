import { NextRequest, NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/admin/financial/commissions
 *
 * Filters:
 *   user_id  — restrict to one rep
 *   role_code
 *   status   — earned | held | reversed | paid | cancelled
 *   since_days — window (default 365)
 *
 * Returns rows + a summary block for the current filter.
 */

export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const userId = url.searchParams.get("user_id");
  const roleCode = url.searchParams.get("role_code");
  const status = url.searchParams.get("status");
  const sinceDays = Math.max(1, Math.min(3650, Number(url.searchParams.get("since_days") || 365)));
  const limit = Math.max(1, Math.min(2000, Number(url.searchParams.get("limit") || 500)));
  const cutoff = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();

  let query = supabaseAdmin
    .from("commission_ledger")
    .select(`
      *,
      user:user_id(id, full_name, email),
      order:order_id(id, total_value, order_type, order_status, created_at)
    `)
    .gte("earned_at", cutoff)
    .order("earned_at", { ascending: false })
    .limit(limit);

  if (userId) query = query.eq("user_id", userId);
  if (roleCode) query = query.eq("role_code", roleCode);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Summary math over the returned window (not affected by limit truncation
  // beyond what the caller already asked for).
  const rows = data || [];
  const summary = {
    earned_cents: 0,
    held_cents: 0,
    reversed_cents: 0,
    paid_cents: 0,
    row_count: rows.length,
  };
  for (const r of rows) {
    const amt = Number(r.amount_cents) || 0;
    if (r.status === "reversed" || amt < 0) summary.reversed_cents += Math.abs(amt);
    else if (r.status === "paid") summary.paid_cents += amt;
    else if (r.status === "held") summary.held_cents += amt;
    else if (r.status === "earned") summary.earned_cents += amt;
  }

  return NextResponse.json({ rows, summary });
}
