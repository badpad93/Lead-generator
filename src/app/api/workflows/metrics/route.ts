import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getWorkflowActor, isStaff } from "@/lib/workflows/permissions";

/**
 * GET /api/workflows/metrics
 *
 * Aggregated numbers for the CRM dashboard. Staff-only. All queries
 * use indexed columns (workflow_type, overall_status, due_date).
 */
export async function GET(req: NextRequest) {
  const actor = await getWorkflowActor(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isStaff(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const now = new Date().toISOString();
  const in7 = new Date(Date.now() + 7 * 86400_000).toISOString();

  const [
    totalActive,
    unassigned,
    dueWithin7,
    overdue,
    byType,
    machinesShipped,
    machinesDelivered,
    locationsSecured,
    coffeeAwaitingShipment,
    financingInProgress,
  ] = await Promise.all([
    countWhere({ ne_status: ["completed", "cancelled", "refunded", "expired"] }),
    countWhere({ ne_status: ["completed", "cancelled", "refunded", "expired"], assigned_null: true }),
    countWhere({
      ne_status: ["completed", "cancelled", "refunded", "expired"],
      due_before: in7,
      due_after: now,
    }),
    countWhere({ ne_status: ["completed", "cancelled", "refunded", "expired"], due_before: now }),
    groupByType(),
    sumStageQuantity("ai_machine_fulfillment", "shipped"),
    sumStageQuantity("ai_machine_fulfillment", "delivered"),
    locationsSecuredMetric(),
    countCoffeeAwaitingShipment(),
    countFinancingInProgress(),
  ]);

  return NextResponse.json({
    totalActive,
    unassigned,
    dueWithin7,
    overdue,
    byType,
    machinesShipped,
    machinesDelivered,
    locationsSecured,
    coffeeAwaitingShipment,
    financingInProgress,
  });
}

async function countWhere(f: {
  ne_status?: string[];
  assigned_null?: boolean;
  due_before?: string;
  due_after?: string;
}): Promise<number> {
  let q = supabaseAdmin.from("workflows").select("id", { count: "exact", head: true });
  if (f.ne_status) q = q.not("overall_status", "in", `(${f.ne_status.map((s) => `"${s}"`).join(",")})`);
  if (f.assigned_null) q = q.is("assigned_user_id", null);
  if (f.due_before) q = q.lte("due_date", f.due_before);
  if (f.due_after) q = q.gte("due_date", f.due_after);
  const { count } = await q;
  return count ?? 0;
}

async function groupByType(): Promise<Record<string, number>> {
  const { data } = await supabaseAdmin
    .from("workflows")
    .select("workflow_type")
    .not("overall_status", "in", '("completed","cancelled","refunded","expired")');
  const out: Record<string, number> = {};
  for (const row of data ?? []) {
    const key = (row as { workflow_type: string }).workflow_type;
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

async function sumStageQuantity(workflowType: string, stageKey: string): Promise<number> {
  // Sum completed_quantity of the named stage across all workflows of this type.
  const { data } = await supabaseAdmin
    .from("workflow_stages")
    .select("completed_quantity, workflow_id!inner(workflow_type)")
    .eq("stage_key", stageKey);
  const rows = (data ?? []) as unknown as { completed_quantity: number; workflow_id: { workflow_type: string } }[];
  return rows
    .filter((r) => r.workflow_id.workflow_type === workflowType)
    .reduce((sum, r) => sum + Number(r.completed_quantity ?? 0), 0);
}

async function locationsSecuredMetric(): Promise<{ secured: number; purchased: number; percent: number }> {
  const { data: purchased } = await supabaseAdmin
    .from("workflows")
    .select("quantity_purchased")
    .eq("workflow_type", "location_services");
  const totalPurchased = (purchased ?? []).reduce((s, r) => s + Number((r as { quantity_purchased: number }).quantity_purchased ?? 0), 0);

  const securedNum = await sumStageQuantity("location_services", "secured");
  const pct = totalPurchased > 0 ? Math.round((securedNum / totalPurchased) * 100) : 0;
  return { secured: securedNum, purchased: totalPurchased, percent: pct };
}

async function countCoffeeAwaitingShipment(): Promise<number> {
  // coffee_equipment workflows in progress with shipped < committed.
  const { data } = await supabaseAdmin
    .from("workflows")
    .select("id, quantity_purchased")
    .eq("workflow_type", "coffee_equipment")
    .not("overall_status", "in", '("completed","cancelled","refunded","expired")');
  const rows = (data ?? []) as { id: string; quantity_purchased: number }[];
  let awaiting = 0;
  for (const w of rows) {
    const { data: shippedRow } = await supabaseAdmin
      .from("workflow_stages")
      .select("completed_quantity")
      .eq("workflow_id", w.id)
      .eq("stage_key", "shipped")
      .maybeSingle();
    const shipped = Number(shippedRow?.completed_quantity ?? 0);
    if (shipped < Number(w.quantity_purchased)) awaiting += 1;
  }
  return awaiting;
}

async function countFinancingInProgress(): Promise<number> {
  const { count } = await supabaseAdmin
    .from("workflows")
    .select("id", { count: "exact", head: true })
    .eq("workflow_type", "financing")
    .not("overall_status", "in", '("completed","cancelled","refunded","expired")');
  return count ?? 0;
}
