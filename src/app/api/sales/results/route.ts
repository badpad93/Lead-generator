import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

type Period = "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "ytd";

function periodStart(period: Period): Date {
  const now = new Date();
  const d = new Date(now);
  switch (period) {
    case "daily":
      d.setHours(0, 0, 0, 0);
      return d;
    case "weekly": {
      const day = d.getDay(); // 0 = Sunday
      d.setDate(d.getDate() - day);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "monthly":
      return new Date(d.getFullYear(), d.getMonth(), 1);
    case "quarterly": {
      const q = Math.floor(d.getMonth() / 3) * 3;
      return new Date(d.getFullYear(), q, 1);
    }
    case "yearly":
    case "ytd":
      return new Date(d.getFullYear(), 0, 1);
  }
}

/**
 * GET /api/sales/results?user_id=<id>&period=<period>
 * Returns computed sales metrics for a given user + period.
 * Sales reps can only query their own results; admins can query any user.
 */
export async function GET(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const period = (url.searchParams.get("period") || "monthly") as Period;
  const targetUserId = url.searchParams.get("user_id") || user.id;

  if (user.role !== "admin" && targetUserId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const since = periodStart(period).toISOString();

  // Leads created/assigned in period
  const { data: leads } = await supabaseAdmin
    .from("sales_leads")
    .select("id, status, created_at")
    .or(`assigned_to.eq.${targetUserId},created_by.eq.${targetUserId}`)
    .gte("created_at", since);

  // All deals owned by user (no date filter — won deals may predate the period)
  const { data: allDeals } = await supabaseAdmin
    .from("sales_deals")
    .select("id, stage, value, created_at, locked_at")
    .eq("assigned_to", targetUserId);

  // Deals created in period (for period-specific counts)
  const deals = (allDeals || []).filter(
    (d) => d.created_at >= since
  );

  // Orders created by user in period
  const { data: orders } = await supabaseAdmin
    .from("sales_orders")
    .select("id, status, total_value, created_at")
    .eq("created_by", targetUserId)
    .gte("created_at", since);

  // Goal for this period (if any)
  const goalPeriod = period === "ytd" ? "yearly" : period;
  const { data: goal } = await supabaseAdmin
    .from("sales_goals")
    .select("*")
    .eq("user_id", targetUserId)
    .eq("period", goalPeriod)
    .maybeSingle();

  const leadsByStatus: Record<string, number> = {
    new: 0,
    contacted: 0,
    qualified: 0,
    unqualified: 0,
    lost: 0,
  };
  for (const l of leads || []) {
    leadsByStatus[l.status] = (leadsByStatus[l.status] || 0) + 1;
  }

  // Stage breakdown uses period-created deals
  const dealsByStage: Record<string, number> = {};
  let pipelineValue = 0;
  for (const d of deals || []) {
    dealsByStage[d.stage] = (dealsByStage[d.stage] || 0) + 1;
    pipelineValue += Number(d.value || 0);
  }

  // Won metrics use ALL deals (won deals may have been created before this period)
  let wonValue = 0;
  let wonCount = 0;
  for (const d of allDeals || []) {
    if (d.stage === "won") {
      // If locked_at exists, use it to filter by period; otherwise count all won deals
      const wonDate = d.locked_at || d.created_at;
      if (wonDate >= since) {
        wonValue += Number(d.value || 0);
        wonCount += 1;
      }
    }
  }

  const orderRevenue = (orders || []).reduce(
    (sum, o) => sum + Number(o.total_value || 0),
    0
  );
  const completedOrders = (orders || []).filter((o) => o.status === "completed").length;

  // Close rate = won deals / total deals (not leads)
  const totalDeals = (allDeals || []).length;
  const closeRate = totalDeals > 0 ? wonCount / totalDeals : 0;

  return NextResponse.json({
    period,
    user_id: targetUserId,
    since,
    metrics: {
      leads_total: (leads || []).length,
      leads_by_status: leadsByStatus,
      deals_total: (deals || []).length,
      deals_by_stage: dealsByStage,
      deals_won: wonCount,
      pipeline_value: pipelineValue,
      won_value: wonValue,
      orders_total: (orders || []).length,
      orders_completed: completedOrders,
      order_revenue: orderRevenue,
      conversion_rate: closeRate,
    },
    goal: goal || null,
  });
}
