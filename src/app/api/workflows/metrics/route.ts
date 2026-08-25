import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getWorkflowActor, isStaff, type WorkflowActor } from "@/lib/workflows/permissions";

/**
 * GET /api/workflows/metrics
 *
 * Aggregated numbers for the CRM dashboard. Staff-only. Admins see
 * org-wide counts; every other staff role sees only workflows they
 * are personally assigned to (matching the /api/workflows list-scope
 * rule). All queries use indexed columns.
 */
export async function GET(req: NextRequest) {
  const actor = await getWorkflowActor(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isStaff(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const now = new Date().toISOString();
  const in7 = new Date(Date.now() + 7 * 86400_000).toISOString();

  // Non-admin staff get the pre-filtered set of workflow ids they can
  // see. Everything below narrows to that set via .in("id", ids). null
  // means "no restriction" — admin path.
  const visibleIds = await resolveVisibleWorkflowIds(actor);

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
    countWhere(visibleIds, { ne_status: ["completed", "cancelled", "refunded", "expired"] }),
    countWhere(visibleIds, { ne_status: ["completed", "cancelled", "refunded", "expired"], assigned_null: true }),
    countWhere(visibleIds, {
      ne_status: ["completed", "cancelled", "refunded", "expired"],
      due_before: in7,
      due_after: now,
    }),
    countWhere(visibleIds, { ne_status: ["completed", "cancelled", "refunded", "expired"], due_before: now }),
    groupByType(visibleIds),
    sumStageQuantity(visibleIds, "ai_machine_fulfillment", "shipped"),
    sumStageQuantity(visibleIds, "ai_machine_fulfillment", "delivered"),
    locationsSecuredMetric(visibleIds),
    countCoffeeAwaitingShipment(visibleIds),
    countFinancingInProgress(visibleIds),
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

/**
 * For non-admin staff, return the exhaustive list of workflow ids the
 * actor is allowed to see (primary_owner OR active collaborator).
 * Returns null for admin (meaning "no restriction").
 */
async function resolveVisibleWorkflowIds(actor: WorkflowActor): Promise<string[] | null> {
  if (actor.scope === "all") return null;
  const [assignedRes, createdRes, collabRes] = await Promise.all([
    supabaseAdmin.from("workflows").select("id").eq("assigned_user_id", actor.id),
    // Creator inclusion — mirrors the /api/workflows list rule so
    // the dashboard metrics account for workflows the actor spawned
    // but hasn't (yet) assigned to themselves.
    supabaseAdmin.from("workflows").select("id").eq("created_by", actor.id),
    supabaseAdmin
      .from("workflow_assignments")
      .select("workflow_id")
      .eq("user_id", actor.id)
      .eq("active", true),
  ]);
  const ids = new Set<string>();
  for (const r of assignedRes.data ?? []) if (r.id) ids.add(r.id as string);
  for (const r of createdRes.data ?? []) if (r.id) ids.add(r.id as string);
  for (const r of collabRes.data ?? []) if (r.workflow_id) ids.add(r.workflow_id as string);
  return Array.from(ids);
}

async function countWhere(
  visibleIds: string[] | null,
  f: {
    ne_status?: string[];
    assigned_null?: boolean;
    due_before?: string;
    due_after?: string;
  },
): Promise<number> {
  if (visibleIds !== null && visibleIds.length === 0) return 0;
  let q = supabaseAdmin.from("workflows").select("id", { count: "exact", head: true });
  if (visibleIds !== null) q = q.in("id", visibleIds);
  if (f.ne_status) q = q.not("overall_status", "in", `(${f.ne_status.map((s) => `"${s}"`).join(",")})`);
  if (f.assigned_null) q = q.is("assigned_user_id", null);
  if (f.due_before) q = q.lte("due_date", f.due_before);
  if (f.due_after) q = q.gte("due_date", f.due_after);
  const { count } = await q;
  return count ?? 0;
}

async function groupByType(visibleIds: string[] | null): Promise<Record<string, number>> {
  if (visibleIds !== null && visibleIds.length === 0) return {};
  let q = supabaseAdmin
    .from("workflows")
    .select("workflow_type")
    .not("overall_status", "in", '("completed","cancelled","refunded","expired")');
  if (visibleIds !== null) q = q.in("id", visibleIds);
  const { data } = await q;
  const out: Record<string, number> = {};
  for (const row of data ?? []) {
    const key = (row as { workflow_type: string }).workflow_type;
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

async function sumStageQuantity(
  visibleIds: string[] | null,
  workflowType: string,
  stageKey: string,
): Promise<number> {
  if (visibleIds !== null && visibleIds.length === 0) return 0;
  // Sum completed_quantity of the named stage across visible workflows of this type.
  let q = supabaseAdmin
    .from("workflow_stages")
    .select("completed_quantity, workflow_id!inner(id, workflow_type)")
    .eq("stage_key", stageKey);
  if (visibleIds !== null) q = q.in("workflow_id", visibleIds);
  const { data } = await q;
  const rows = (data ?? []) as unknown as { completed_quantity: number; workflow_id: { workflow_type: string } }[];
  return rows
    .filter((r) => r.workflow_id.workflow_type === workflowType)
    .reduce((sum, r) => sum + Number(r.completed_quantity ?? 0), 0);
}

async function locationsSecuredMetric(
  visibleIds: string[] | null,
): Promise<{ secured: number; purchased: number; percent: number }> {
  if (visibleIds !== null && visibleIds.length === 0) {
    return { secured: 0, purchased: 0, percent: 0 };
  }
  let q = supabaseAdmin
    .from("workflows")
    .select("quantity_purchased")
    .eq("workflow_type", "location_services");
  if (visibleIds !== null) q = q.in("id", visibleIds);
  const { data: purchased } = await q;
  const totalPurchased = (purchased ?? []).reduce(
    (s, r) => s + Number((r as { quantity_purchased: number }).quantity_purchased ?? 0),
    0,
  );

  const securedNum = await sumStageQuantity(visibleIds, "location_services", "secured");
  const pct = totalPurchased > 0 ? Math.round((securedNum / totalPurchased) * 100) : 0;
  return { secured: securedNum, purchased: totalPurchased, percent: pct };
}

async function countCoffeeAwaitingShipment(visibleIds: string[] | null): Promise<number> {
  if (visibleIds !== null && visibleIds.length === 0) return 0;
  let q = supabaseAdmin
    .from("workflows")
    .select("id, quantity_purchased")
    .eq("workflow_type", "coffee_equipment")
    .not("overall_status", "in", '("completed","cancelled","refunded","expired")');
  if (visibleIds !== null) q = q.in("id", visibleIds);
  const { data } = await q;
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

async function countFinancingInProgress(visibleIds: string[] | null): Promise<number> {
  if (visibleIds !== null && visibleIds.length === 0) return 0;
  let q = supabaseAdmin
    .from("workflows")
    .select("id", { count: "exact", head: true })
    .eq("workflow_type", "financing")
    .not("overall_status", "in", '("completed","cancelled","refunded","expired")');
  if (visibleIds !== null) q = q.in("id", visibleIds);
  const { count } = await q;
  return count ?? 0;
}
