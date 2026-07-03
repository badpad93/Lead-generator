import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

/**
 * GET /api/admin/financial/invoices
 *   status filter: draft | open | partially_paid | paid | overdue | void | written_off | all
 *   bucket filter: 0-30 | 31-60 | 61-90 | 90+
 * Returns aging summary + rows.
 */

export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "all";
  const bucket = searchParams.get("bucket");
  const limit = Math.min(500, Math.max(1, Number(searchParams.get("limit") || 200)));

  // Aging summary (all invoices with balance)
  const { data: aging } = await supabaseAdmin
    .from("invoices")
    .select("id, total_cents, balance_due_cents, due_date, sent_at, status")
    .in("status", ["open", "partially_paid", "overdue"])
    .limit(2000);

  const today = new Date();
  const summary = {
    open: { count: 0, balance_cents: 0 },
    b0_30: { count: 0, balance_cents: 0 },
    b31_60: { count: 0, balance_cents: 0 },
    b61_90: { count: 0, balance_cents: 0 },
    b90_plus: { count: 0, balance_cents: 0 },
  };

  for (const inv of aging || []) {
    const bal = Number(inv.balance_due_cents || 0);
    summary.open.count++;
    summary.open.balance_cents += bal;
    const anchor = inv.due_date ? new Date(inv.due_date) : inv.sent_at ? new Date(inv.sent_at) : today;
    const daysOld = Math.floor((today.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24));
    if (daysOld < 30) { summary.b0_30.count++; summary.b0_30.balance_cents += bal; }
    else if (daysOld < 60) { summary.b31_60.count++; summary.b31_60.balance_cents += bal; }
    else if (daysOld < 90) { summary.b61_90.count++; summary.b61_90.balance_cents += bal; }
    else { summary.b90_plus.count++; summary.b90_plus.balance_cents += bal; }
  }

  // Detail rows
  let query = supabaseAdmin
    .from("invoices")
    .select("*")
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(limit);
  if (status !== "all") query = query.eq("status", status);
  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let filtered = rows || [];
  if (bucket) {
    filtered = filtered.filter((inv) => {
      const anchor = inv.due_date ? new Date(inv.due_date) : inv.sent_at ? new Date(inv.sent_at) : today;
      const daysOld = Math.floor((today.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24));
      if (bucket === "0-30") return daysOld < 30;
      if (bucket === "31-60") return daysOld >= 30 && daysOld < 60;
      if (bucket === "61-90") return daysOld >= 60 && daysOld < 90;
      if (bucket === "90+") return daysOld >= 90;
      return true;
    });
  }

  return NextResponse.json({ summary, invoices: filtered });
}
