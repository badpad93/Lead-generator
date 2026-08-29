import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { canViewWorkflow, getWorkflowActor, hasPermission, isStaff } from "@/lib/workflows/permissions";

/**
 * GET /api/workflows/[id]
 *
 * Full workflow detail: workflow row + all stages + assignments + notes
 * (internal filtered out for non-staff) + shipments + order items +
 * event history + related placement contract summary + linked
 * marketplace submissions summary.
 *
 * Customers can hit this endpoint too — internal_notes and events are
 * hidden from them; only customer-visible stages and customer notes
 * are returned.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getWorkflowActor(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { data: workflow } = await supabaseAdmin
    .from("workflows")
    .select("*, sales_orders(order_number, document_type)")
    .eq("id", id)
    .maybeSingle();

  if (!workflow) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const canView = await canViewWorkflow(actor, {
    id: workflow.id,
    customer_id: workflow.customer_id,
    assigned_user_id: workflow.assigned_user_id,
    // Threaded through so a non-admin creator can still view their
    // own spawned workflow even if it isn't assigned to them.
    created_by: (workflow as { created_by?: string | null }).created_by ?? null,
  });
  if (!canView) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const staffView = isStaff(actor);
  const isOwner = workflow.customer_id === actor.id;

  // Stages: filter customer_visible=false for customers.
  const stagesQuery = supabaseAdmin
    .from("workflow_stages")
    .select("*")
    .eq("workflow_id", id)
    .order("stage_order", { ascending: true });
  let { data: allStages } = await stagesQuery;

  // Lazy self-heal: if the workflow has no stages, try to seed them
  // from the template. We resolve the template by BOTH template_id
  // (preferred) and workflow_type (fallback) — the fallback catches
  // workflows spawned before the template existed OR spawned by a
  // code path that didn't set template_id, both of which show up as
  // empty-stage workflows even though the admin has already published
  // a template that matches. Staff-triggered only so a customer view
  // doesn't quietly write to the DB. Also back-fills workflows.template_id
  // when we resolve via workflow_type so subsequent reads take the
  // faster path and the History tab shows the linkage.
  if (staffView && (!allStages || allStages.length === 0)) {
    const existingTemplateId = (workflow as { template_id?: string | null }).template_id ?? null;
    let template: { id: string } | null = existingTemplateId ? { id: existingTemplateId } : null;

    if (!template && workflow.workflow_type) {
      const { data: matched } = await supabaseAdmin
        .from("workflow_templates")
        .select("id, version")
        .eq("workflow_type", workflow.workflow_type)
        .eq("active", true)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (matched) {
        template = { id: matched.id };
        // Backfill workflows.template_id + template_version so the
        // linkage is durable and the fast path picks it up next time.
        await supabaseAdmin
          .from("workflows")
          .update({ template_id: matched.id, template_version: matched.version })
          .eq("id", id);
      }
    }

    if (template) {
      const { data: templateStages } = await supabaseAdmin
        .from("workflow_template_stages")
        .select("*")
        .eq("template_id", template.id)
        .order("stage_order", { ascending: true });
      if (templateStages && templateStages.length > 0) {
        const rows = templateStages.map((ts) => ({
          workflow_id: id,
          template_stage_id: ts.id,
          stage_key: ts.stage_key,
          stage_name: ts.stage_name,
          stage_order: ts.stage_order,
          stage_type: ts.stage_type,
          status: "not_started",
          target_quantity: ts.stage_type === "quantity" ? (workflow.quantity_purchased ?? 1) : null,
          completed_quantity: 0,
          customer_visible: ts.customer_visible,
          required_for_completion: ts.required_for_completion,
          customer_message: ts.default_customer_message,
        }));
        const { error: seedErr } = await supabaseAdmin.from("workflow_stages").insert(rows);
        if (seedErr) {
          console.error("[workflows.detail] lazy stage seed failed:", seedErr.message);
        } else {
          const reread = await stagesQuery;
          allStages = reread.data;
        }
      }
    }
  }

  const stages = staffView
    ? (allStages ?? [])
    : (allStages ?? []).filter((s) => s.customer_visible);

  // Notes: internal only visible to staff.
  const { data: allNotes } = await supabaseAdmin
    .from("workflow_notes")
    .select("*")
    .eq("workflow_id", id)
    .order("created_at", { ascending: false });
  const notes = staffView
    ? (allNotes ?? [])
    : (allNotes ?? []).filter((n) => n.visibility === "customer");

  // Assignments (staff only — customers see only assignee name when
  // show_assignee_to_customer is true on the workflow, joined below).
  // Hydrated with each user's display name so the detail-page
  // Assignees panel can render "Vic Reynolds — primary_owner" without
  // an N+1 lookup on the client.
  const rawAssignments = staffView
    ? (
        await supabaseAdmin
          .from("workflow_assignments")
          .select("*")
          .eq("workflow_id", id)
          .eq("active", true)
          .order("assigned_at", { ascending: true })
      ).data ?? []
    : [];
  let assignments: Array<Record<string, unknown>> = rawAssignments;
  if (rawAssignments.length > 0) {
    const assigneeIds = Array.from(
      new Set(rawAssignments.map((a) => a.user_id).filter(Boolean) as string[]),
    );
    const { data: assigneeProfiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", assigneeIds);
    const byId = new Map(
      (assigneeProfiles ?? []).map((p) => [p.id, { full_name: p.full_name, email: p.email }]),
    );
    assignments = rawAssignments.map((a) => ({
      ...a,
      user_profile: a.user_id ? byId.get(a.user_id) ?? null : null,
    }));
  }

  // Shipments always visible.
  const { data: shipments } = await supabaseAdmin
    .from("workflow_shipments")
    .select("*")
    .eq("workflow_id", id)
    .order("ship_date", { ascending: false, nullsFirst: false });

  // Order items always visible (customer needs to see per-order status).
  const { data: orderItems } = await supabaseAdmin
    .from("workflow_order_items")
    .select("*")
    .eq("workflow_id", id)
    .order("created_at", { ascending: false });

  // Events: staff only.
  const { data: events } = staffView
    ? await supabaseAdmin
        .from("workflow_events")
        .select("*")
        .eq("workflow_id", id)
        .order("created_at", { ascending: false })
        .limit(100)
    : { data: null };

  // Linked placement contract summary (staff + owner see it — never
  // includes PP identity beyond what the PP marketplace itself shows).
  let placementSummary: {
    id: string;
    title: string;
    status: string;
    locations_needed: number;
    locations_filled: number;
    submissions_count: number;
    submissions_accepted: number;
    submissions_pending_admin: number;
  } | null = null;
  if (workflow.placement_contract_id) {
    const { data: contract } = await supabaseAdmin
      .from("placement_contracts")
      .select("id, title, status, locations_needed, locations_filled")
      .eq("id", workflow.placement_contract_id)
      .maybeSingle();
    if (contract) {
      const { data: subs } = await supabaseAdmin
        .from("placement_submissions")
        .select("admin_status, operator_status")
        .eq("contract_id", contract.id);
      const list = subs ?? [];
      placementSummary = {
        id: contract.id,
        title: contract.title,
        status: contract.status,
        locations_needed: contract.locations_needed,
        locations_filled: contract.locations_filled,
        submissions_count: list.length,
        submissions_accepted: list.filter((s) => s.operator_status === "accepted").length,
        submissions_pending_admin: list.filter((s) => s.admin_status === "pending").length,
      };
    }
  }

  // Customer profile — always fetched so both the CRM header and the
  // customer's own view have a name to render. Contact info (email,
  // phone) is included only for staff; customers already know their own.
  const { data: customerProfile } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, phone, role")
    .eq("id", workflow.customer_id)
    .maybeSingle();

  const customerInfo = customerProfile
    ? {
        id: customerProfile.id,
        full_name: customerProfile.full_name,
        role: customerProfile.role,
        email: staffView ? customerProfile.email : null,
        phone: staffView ? customerProfile.phone : null,
      }
    : null;

  // Optional company (sales_accounts) — only when workflow.company_id
  // is set. Staff-only, since it's an internal account record.
  let companyInfo: { id: string; business_name: string; phone: string | null; email: string | null } | null = null;
  if (staffView && workflow.company_id) {
    const { data: acc } = await supabaseAdmin
      .from("sales_accounts")
      .select("id, business_name, phone, email")
      .eq("id", workflow.company_id)
      .maybeSingle();
    if (acc) companyInfo = acc;
  }

  // Customer approvals (pending + recent decisions). Customers must see
  // pending items so they can accept/decline; staff need visibility for
  // support.
  const { data: approvals } = await supabaseAdmin
    .from("workflow_customer_approvals")
    .select("id, status, location_snapshot, decided_at, decline_reason, presented_at, placement_submission_id")
    .eq("workflow_id", id)
    .order("presented_at", { ascending: false });

  const pendingApprovals = (approvals ?? []).filter((a) => a.status === "pending");
  const remainingDeclines = Math.max(
    0,
    Number(workflow.quantity_purchased) - Number((workflow as { decline_budget_used?: number }).decline_budget_used ?? 0),
  );

  const balanceSummary = {
    totalDueCents: Number(workflow.total_due_cents ?? 0),
    depositPaidCents: Number(workflow.deposit_paid_cents ?? 0),
    balanceCents: Math.max(
      0,
      Number(workflow.total_due_cents ?? 0) - Number(workflow.deposit_paid_cents ?? 0),
    ),
  };

  // Assignee display name for customer view (only if opt-in flag on).
  let assigneeDisplay: string | null = null;
  if (workflow.assigned_user_id) {
    const { data: assignee } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email")
      .eq("id", workflow.assigned_user_id)
      .maybeSingle();
    if (assignee) {
      assigneeDisplay = staffView || workflow.show_assignee_to_customer
        ? assignee.full_name || assignee.email
        : friendlyTeamName(workflow.primary_team);
    }
  } else if (!staffView) {
    assigneeDisplay = friendlyTeamName(workflow.primary_team);
  }

  return NextResponse.json({
    workflow,
    stages,
    notes,
    assignments: assignments ?? [],
    shipments: shipments ?? [],
    orderItems: orderItems ?? [],
    events: events ?? [],
    placementSummary,
    pendingApprovals,
    approvals: approvals ?? [],
    remainingDeclines,
    balanceSummary,
    customerInfo,
    companyInfo,
    assigneeDisplay,
    isStaffView: staffView,
    isOwner,
    canDelete: hasPermission(actor, "workflows.delete"),
    // Exposed so the Assignees panel can decide whether the current
    // viewer's own assignment needs an "Accept" button.
    viewerId: actor.id,
  });
}

/**
 * DELETE /api/workflows/[id]
 *
 * Admin-only hard delete. The workflow row and every child
 * (workflow_stages, workflow_events, workflow_notes,
 * workflow_assignments, workflow_shipments, workflow_order_items,
 * workflow_notification_dispatches, workflow_customer_approvals) drop
 * via ON DELETE CASCADE. time_entries.workflow_id is SET NULL so time
 * clock history stays intact.
 *
 * An audit_logs row is written BEFORE the delete so the paper trail
 * survives the cascade — reason is required.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getWorkflowActor(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(actor, "workflows.delete")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!reason) {
    return NextResponse.json({ error: "Reason is required" }, { status: 400 });
  }
  if (reason.length > 500) {
    return NextResponse.json({ error: "Reason too long" }, { status: 400 });
  }

  const { data: workflow } = await supabaseAdmin
    .from("workflows")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!workflow) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Write the audit trail first — after the delete the workflow_events
  // rows are gone with the cascade, so audit_logs is the last surviving
  // record of who did what and why.
  await supabaseAdmin.from("audit_logs").insert({
    actor_id: actor.id,
    action: "workflow_deleted",
    entity_type: "workflow",
    entity_id: id,
    reason,
    before: workflow,
    after: null,
  });

  const { error } = await supabaseAdmin.from("workflows").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

function friendlyTeamName(team: string | null): string {
  switch (team) {
    case "fulfillment":
      return "Fulfillment Team";
    case "locations":
      return "Location Team";
    case "financing":
      return "Financing Team";
    case "coffee":
      return "Coffee Service Team";
    default:
      return "Vending Connector Team";
  }
}
