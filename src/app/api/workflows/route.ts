import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getWorkflowActor, hasPermission, isStaff } from "@/lib/workflows/permissions";
import { createWorkflowSchema, listWorkflowsQuerySchema } from "@/lib/workflows/schemas";
import { getOrCreateWorkflow } from "@/lib/workflows/service";
import type { WorkflowType } from "@/lib/workflows/types";

/**
 * GET /api/workflows
 *
 * List workflows visible to the requesting staff user. Customers use
 * /api/account/workflows instead — this endpoint always denies non-staff
 * to keep the query shape predictable.
 *
 * Filters (all optional, all validated via zod): workflowType, status,
 * assignedUserId, customerId, companyId, agreementId, orderId, dueBefore,
 * dueAfter, overdue=true|false, unassigned=true|false, priority,
 * search (matches title/product_name), limit (1-200, default 50),
 * offset, orderBy, orderDir.
 */
export async function GET(req: NextRequest) {
  const actor = await getWorkflowActor(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isStaff(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const parsed = listWorkflowsQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", details: parsed.error.format() }, { status: 400 });
  }
  const q = parsed.data;

  let query = supabaseAdmin
    .from("workflows")
    .select("*", { count: "exact" });

  if (q.workflowType) query = query.eq("workflow_type", q.workflowType);
  if (q.status) query = query.eq("overall_status", q.status);
  if (q.assignedUserId) query = query.eq("assigned_user_id", q.assignedUserId);
  if (q.customerId) query = query.eq("customer_id", q.customerId);
  if (q.companyId) query = query.eq("company_id", q.companyId);
  if (q.agreementId) query = query.eq("agreement_id", q.agreementId);
  if (q.orderId) query = query.eq("order_id", q.orderId);
  if (q.priority) query = query.eq("priority", q.priority);
  if (q.dueBefore) query = query.lte("due_date", q.dueBefore);
  if (q.dueAfter) query = query.gte("due_date", q.dueAfter);
  if (q.overdue === "true") {
    query = query
      .lt("due_date", new Date().toISOString())
      .is("completed_at", null)
      .is("cancelled_at", null);
  }
  if (q.unassigned === "true") query = query.is("assigned_user_id", null);
  if (q.search) query = query.or(`title.ilike.%${q.search}%,product_name.ilike.%${q.search}%,workflow_number.ilike.%${q.search}%`);

  // Scope: `assigned` sees own + collaborator + primary; `all` sees all.
  if (actor.scope === "assigned") {
    const { data: collabIds } = await supabaseAdmin
      .from("workflow_assignments")
      .select("workflow_id")
      .eq("user_id", actor.id)
      .eq("active", true);
    const ids = (collabIds ?? []).map((r) => r.workflow_id).filter(Boolean);
    const csv = ids.length > 0 ? ids.join(",") : "00000000-0000-0000-0000-000000000000";
    query = query.or(`assigned_user_id.eq.${actor.id},id.in.(${csv})`);
  }

  const orderBy = q.orderBy ?? "due_date";
  const ascending = (q.orderDir ?? "asc") === "asc";
  query = query.order(orderBy, { ascending, nullsFirst: false });

  const limit = q.limit ?? 50;
  const offset = q.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    workflows: data ?? [],
    total: count ?? 0,
    limit,
    offset,
  });
}

/**
 * POST /api/workflows
 *
 * Manual workflow creation. Requires workflows.create (admin, DOS,
 * market_leader). Customer always gets the "workflow created" email
 * unless the caller explicitly passes suppressInitialCustomerEmail=true.
 *
 * Body: matches createWorkflowSchema, with sourceType forced to
 * 'admin_manual' and sourceId set to a fresh uuid so the idempotency
 * index doesn't clash with auto-spawned workflows.
 */
export async function POST(req: NextRequest) {
  const actor = await getWorkflowActor(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(actor, "workflows.create")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));

  if (!body.customerId) {
    return NextResponse.json({ error: "customerId is required" }, { status: 400 });
  }
  if (!body.workflowType) {
    return NextResponse.json({ error: "workflowType is required" }, { status: 400 });
  }

  // Force source_type + source_id so manual creations get a fresh
  // idempotency key every time (never collides with auto-spawned
  // workflows from agreements/orders).
  const parsed = createWorkflowSchema.safeParse({
    ...body,
    sourceType: "admin_manual",
    sourceId: crypto.randomUUID(),
    workflowType: body.workflowType as WorkflowType,
    createdBy: actor.id,
    actorType: "staff",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.format() }, { status: 400 });
  }

  try {
    const { workflow, stages, created } = await getOrCreateWorkflow(parsed.data);
    return NextResponse.json({ ok: true, workflow, stagesCount: stages.length, created });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Create failed" }, { status: 400 });
  }
}
