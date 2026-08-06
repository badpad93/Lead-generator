import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { canOperationallyEditWorkflow, getWorkflowActor, hasPermission, isStaff } from "@/lib/workflows/permissions";
import { updateStageSchema } from "@/lib/workflows/schemas";
import { updateStage } from "@/lib/workflows/service";

/**
 * PATCH /api/workflows/[id]/stages/[stageKey]
 *
 * Update a stage's quantity, status, internal notes, or customer message.
 * All validation (non-negative, target respect, monotonic across prior
 * quantity stages) lives in the service layer.
 *
 * Body: matches updateStageSchema (workflowId + stageKey injected from
 * URL params).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; stageKey: string }> },
) {
  const actor = await getWorkflowActor(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, stageKey } = await params;

  const body = await req.json().catch(() => ({}));
  const parsed = updateStageSchema.safeParse({
    ...body,
    workflowId: id,
    stageKey,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.format() }, { status: 400 });
  }

  const input = parsed.data;

  // Load the workflow up front — every permission below depends on
  // whether the actor is assigned to THIS workflow, not just their
  // role in the abstract.
  const { data: workflow } = await supabaseAdmin
    .from("workflows")
    .select("id, customer_id, assigned_user_id")
    .eq("id", id)
    .maybeSingle();
  if (!workflow) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });

  // Operational edits (status / quantity / stage rename) — sales
  // reps assigned to THIS workflow can now do these, matching how
  // elevated roles have always been able to. Customer-visible
  // messages, override-target, and internal-notes stay on their
  // original gates.
  const canOperationallyEdit = await canOperationallyEditWorkflow(actor, workflow);

  if (input.completedQuantity !== undefined && !canOperationallyEdit) {
    return NextResponse.json({ error: "Forbidden — you must be assigned to edit this workflow" }, { status: 403 });
  }
  if (input.status !== undefined && !canOperationallyEdit) {
    return NextResponse.json({ error: "Forbidden — you must be assigned to edit this workflow" }, { status: 403 });
  }
  if (input.stageName !== undefined && !canOperationallyEdit) {
    return NextResponse.json({ error: "Forbidden — you must be assigned to edit this workflow" }, { status: 403 });
  }
  if (input.internalNotes !== undefined && !isStaff(actor)) {
    return NextResponse.json({ error: "Forbidden — cannot add internal notes" }, { status: 403 });
  }
  if (input.customerMessage !== undefined && !hasPermission(actor, "workflows.publish_customer_updates")) {
    return NextResponse.json({ error: "Forbidden — cannot publish customer updates" }, { status: 403 });
  }
  if (input.allowOverTarget && !hasPermission(actor, "workflows.override_validation")) {
    return NextResponse.json({ error: "Forbidden — cannot override validation" }, { status: 403 });
  }

  try {
    const result = await updateStage({
      ...input,
      updatedBy: actor.id,
      actorType: "staff",
      source: "api",
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    // Distinguish validation failures (400) from concurrency (409).
    if (message.includes("another user may have edited")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    if (
      message.includes("negative") ||
      message.includes("exceeds target") ||
      message.includes("exceeds prior stage")
    ) {
      return NextResponse.json({ error: message }, { status: 422 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
