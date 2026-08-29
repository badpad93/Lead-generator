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
  if (q.assignedUserId) {
    // Match either the historical single primary_owner column OR any
    // active collaborator row on workflow_assignments — otherwise
    // filtering by a specific person hides every workflow where they
    // are a sales_rep / location_specialist collaborator rather than
    // the primary owner.
    const { data: collabRows } = await supabaseAdmin
      .from("workflow_assignments")
      .select("workflow_id")
      .eq("user_id", q.assignedUserId)
      .eq("active", true);
    const collabIds = (collabRows ?? [])
      .map((r) => r.workflow_id)
      .filter(Boolean);
    const csv = collabIds.length > 0
      ? collabIds.join(",")
      : "00000000-0000-0000-0000-000000000000";
    query = query.or(
      `assigned_user_id.eq.${q.assignedUserId},id.in.(${csv})`,
    );
  }
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

  // Scope: `assigned` sees own + collaborator + primary + creator;
  // `all` sees everything. Creator inclusion (`created_by=eq.${actor.id}`)
  // makes sure a non-admin who spawns a workflow via the manual
  // modal always sees it in their own list — even if they left it
  // unassigned. Matches the canViewWorkflow single-row rule.
  if (actor.scope === "assigned") {
    const { data: collabIds } = await supabaseAdmin
      .from("workflow_assignments")
      .select("workflow_id")
      .eq("user_id", actor.id)
      .eq("active", true);
    const ids = (collabIds ?? []).map((r) => r.workflow_id).filter(Boolean);
    const csv = ids.length > 0 ? ids.join(",") : "00000000-0000-0000-0000-000000000000";
    query = query.or(
      `assigned_user_id.eq.${actor.id},created_by.eq.${actor.id},id.in.(${csv})`,
    );
  }

  const orderBy = q.orderBy ?? "due_date";
  const ascending = (q.orderDir ?? "asc") === "asc";
  query = query.order(orderBy, { ascending, nullsFirst: false });

  const limit = q.limit ?? 50;
  const offset = q.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];

  // Collaborator fallback: workflows.assigned_user_id is only set
  // when the assignment is role='primary_owner'. Other roles
  // (sales_rep, location_specialist, financing_coordinator, etc.)
  // sit in workflow_assignments without touching the workflow row.
  // We look up the active assignments for every workflow on this
  // page so the "Assigned" column reflects real ownership rather
  // than falsely showing "Unassigned" when a collaborator exists.
  const workflowIds = rows.map((r) => r.id);
  const assignmentsByWorkflow: Record<string, Array<{ user_id: string; role: string; assigned_at: string }>> = {};
  if (workflowIds.length > 0) {
    const { data: assignRows } = await supabaseAdmin
      .from("workflow_assignments")
      .select("workflow_id, user_id, role, assigned_at")
      .in("workflow_id", workflowIds)
      .eq("active", true)
      .order("assigned_at", { ascending: true });
    for (const a of assignRows ?? []) {
      if (!a.workflow_id || !a.user_id) continue;
      if (!assignmentsByWorkflow[a.workflow_id]) assignmentsByWorkflow[a.workflow_id] = [];
      assignmentsByWorkflow[a.workflow_id].push({
        user_id: a.user_id,
        role: a.role,
        assigned_at: a.assigned_at,
      });
    }
  }

  // Effective assignee per workflow: prefer workflows.assigned_user_id
  // (the historical primary), then the first primary_owner assignment,
  // then the earliest active assignment of any role.
  function effectiveAssignee(r: typeof rows[number]): {
    userId: string | null;
    role: string | null;
  } {
    if (r.assigned_user_id) return { userId: r.assigned_user_id, role: "primary_owner" };
    const assigns = assignmentsByWorkflow[r.id] ?? [];
    const primary = assigns.find((a) => a.role === "primary_owner");
    if (primary) return { userId: primary.user_id, role: primary.role };
    const first = assigns[0];
    if (first) return { userId: first.user_id, role: first.role };
    return { userId: null, role: null };
  }

  // Batch-fetch customer + effective-assignee names in one round trip.
  const customerIds = Array.from(new Set(rows.map((r) => r.customer_id).filter(Boolean)));
  const assigneeIds = Array.from(
    new Set(rows.map((r) => effectiveAssignee(r).userId).filter((v): v is string => !!v)),
  );
  const profileIds = Array.from(new Set([...customerIds, ...assigneeIds]));
  const profileMap: Record<string, { full_name: string | null; email: string | null }> = {};
  if (profileIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", profileIds);
    for (const p of profiles ?? []) {
      profileMap[p.id] = { full_name: p.full_name, email: p.email };
    }
  }

  const workflowsWithCustomer = rows.map((r) => {
    const eff = effectiveAssignee(r);
    return {
      ...r,
      customer_name: profileMap[r.customer_id]?.full_name ?? null,
      customer_email: profileMap[r.customer_id]?.email ?? null,
      // Historical: keep the column pointing at the primary. UI
      // reads assigned_user_name/email for display, so downstream
      // consumers don't need to know about the fallback.
      assigned_user_name: eff.userId ? profileMap[eff.userId]?.full_name ?? null : null,
      assigned_user_email: eff.userId ? profileMap[eff.userId]?.email ?? null : null,
      assigned_user_id_effective: eff.userId,
      assigned_user_role: eff.role,
    };
  });

  return NextResponse.json({
    workflows: workflowsWithCustomer,
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
    // Bubble the first failed field into `error` so the client shows
    // something actionable instead of the generic "Invalid input".
    const first = parsed.error.issues[0];
    const path = first?.path?.join(".") || "unknown_field";
    return NextResponse.json(
      {
        error: `Invalid input on ${path}: ${first?.message ?? "validation failed"}`,
        details: parsed.error.format(),
      },
      { status: 400 },
    );
  }

  try {
    const { workflow, stages, created } = await getOrCreateWorkflow(parsed.data);

    // Diagnostic: if the workflow was requested with a custom template
    // but ended up with zero stages, look up why so the client can show
    // a clear error instead of silently succeeding.
    let stageWarning: string | null = null;
    if (created && stages.length === 0) {
      const wtype = workflow.workflow_type;
      const { data: tpl } = await supabaseAdmin
        .from("workflow_templates")
        .select("id, active, version")
        .eq("workflow_type", wtype)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!tpl) {
        stageWarning = `No template found for workflow_type "${wtype}". Create one at /admin/workflows/templates and try again.`;
      } else if (!tpl.active) {
        stageWarning = `Template for "${wtype}" (v${tpl.version}) is INACTIVE. Reactivate it at /admin/workflows/templates.`;
      } else {
        const { count } = await supabaseAdmin
          .from("workflow_template_stages")
          .select("id", { count: "exact", head: true })
          .eq("template_id", tpl.id);
        if (!count || count === 0) {
          stageWarning = `Template for "${wtype}" (v${tpl.version}) exists but has ZERO stages defined. Edit the template at /admin/workflows/templates and add stages.`;
        } else {
          stageWarning = `Template resolved (v${tpl.version}, ${count} stages) but seeding failed silently. Check server logs for "[workflows.service]".`;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      workflow,
      stagesCount: stages.length,
      created,
      stageWarning,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Create failed" }, { status: 400 });
  }
}
