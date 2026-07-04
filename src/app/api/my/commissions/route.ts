import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { summarizeCommissionsForUser } from "@/lib/commissions";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/my/commissions
 *
 * Rep-facing: summary block + row list (last N days, default 365). Reads
 * commission_ledger via service role, scoped to the caller's user_id.
 */

export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const sinceDays = Math.max(1, Math.min(3650, Number(url.searchParams.get("since_days") || 365)));
  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit") || 200)));
  const cutoff = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();

  const summary = await summarizeCommissionsForUser(userId, sinceDays);

  const { data: rows } = await supabaseAdmin
    .from("commission_ledger")
    .select(`
      id, order_id, role_code, attribution_percentage, basis_cents, rate_bps, amount_cents,
      hold_days, status, earned_at, clearable_at, paid_at, reversed_of_id, reversal_reason,
      order:order_id(id, total_value, order_type, order_status, created_at)
    `)
    .eq("user_id", userId)
    .gte("earned_at", cutoff)
    .order("earned_at", { ascending: false })
    .limit(limit);

  return NextResponse.json({ summary, rows: rows || [] });
}
