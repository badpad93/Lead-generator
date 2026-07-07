import { NextRequest, NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/admin/financial/commissions
 *
 * Filters:
 *   user_id  — restrict to one rep
 *   role_code
 *   status   — earned | held | paid | reversed | clawback_*
 *   since_days — window (default 365)
 *   limit    — row list cap (default 500)
 *
 * Returns rows (bounded by limit) + summary (unbounded aggregate over the
 * same filter set, so tiles are accurate even when there are more rows
 * than the row cap). When user_id is set, also returns net_available so
 * admin sees the same number the rep sees on /my/commissions.
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

  // ── Bounded row list (for the table) ────────────────────────────────
  let rowQuery = supabaseAdmin
    .from("commission_ledger")
    .select(`
      *,
      user:user_id(id, full_name, email),
      order:order_id(id, total_value, order_type, order_status, created_at)
    `)
    .gte("earned_at", cutoff)
    .order("earned_at", { ascending: false })
    .limit(limit);
  if (userId) rowQuery = rowQuery.eq("user_id", userId);
  if (roleCode) rowQuery = rowQuery.eq("role_code", roleCode);
  if (status) rowQuery = rowQuery.eq("status", status);
  const { data: rowData, error: rowErr } = await rowQuery;
  if (rowErr) return NextResponse.json({ error: rowErr.message }, { status: 500 });
  const rows = rowData || [];

  // ── Unbounded aggregate (for the summary tiles) ─────────────────────
  // Pull only what the summary math needs — this is a wide-net query but
  // narrow columns. Row limit does NOT apply so the tiles are accurate.
  let sumQuery = supabaseAdmin
    .from("commission_ledger")
    .select("amount_cents, status, clearable_at")
    .gte("earned_at", cutoff);
  if (userId) sumQuery = sumQuery.eq("user_id", userId);
  if (roleCode) sumQuery = sumQuery.eq("role_code", roleCode);
  if (status) sumQuery = sumQuery.eq("status", status);
  const { data: sumRows } = await sumQuery;

  const summary = {
    earned_cents: 0,
    held_cents: 0,
    pending_clearable_cents: 0,
    reversed_cents: 0,
    paid_cents: 0,
    clawback_pending_cents: 0,
    clawback_collected_cents: 0,
    clawback_waived_cents: 0,
    net_available_cents: 0,
    row_count: (sumRows || []).length,
  };
  const now = Date.now();
  for (const r of sumRows || []) {
    const amt = Number(r.amount_cents) || 0;
    const mag = Math.abs(amt);
    if (r.status === "reversed") { summary.reversed_cents += mag; continue; }
    if (r.status === "clawback_pending") { summary.clawback_pending_cents += mag; continue; }
    if (r.status === "clawback_collected") { summary.clawback_collected_cents += mag; continue; }
    if (r.status === "clawback_waived") { summary.clawback_waived_cents += mag; continue; }
    if (amt < 0) { summary.reversed_cents += mag; continue; }
    if (r.status === "paid") summary.paid_cents += amt;
    else if (r.status === "held") {
      summary.held_cents += amt;
      if (r.clearable_at && new Date(r.clearable_at as string).getTime() <= now) {
        summary.pending_clearable_cents += amt;
      }
    }
    else if (r.status === "earned") summary.earned_cents += amt;
  }

  // Net available mirrors the rep-side formula so admin sees the same
  // number the rep sees. Only meaningful when scoped to one user, but
  // computing it always keeps the API contract stable.
  summary.net_available_cents = Math.max(
    0,
    summary.earned_cents + summary.pending_clearable_cents - summary.reversed_cents - summary.clawback_pending_cents,
  );

  return NextResponse.json({ rows, summary });
}
