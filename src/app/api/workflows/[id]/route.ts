import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { canViewWorkflow, getWorkflowActor, isStaff } from "@/lib/workflows/permissions";

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
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!workflow) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const canView = await canViewWorkflow(actor, {
    id: workflow.id,
    customer_id: workflow.customer_id,
    assigned_user_id: workflow.assigned_user_id,
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
  const { data: allStages } = await stagesQuery;
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
  const { data: assignments } = staffView
    ? await supabaseAdmin
        .from("workflow_assignments")
        .select("*")
        .eq("workflow_id", id)
        .eq("active", true)
    : { data: null };

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
    assigneeDisplay,
    isStaffView: staffView,
    isOwner,
  });
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
