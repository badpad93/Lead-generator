import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getWorkflowActor, hasPermission } from "@/lib/workflows/permissions";
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

  // Permission checks by field.
  if (input.completedQuantity !== undefined && !hasPermission(actor, "workflows.edit_quantity")) {
    return NextResponse.json({ error: "Forbidden — cannot edit quantity" }, { status: 403 });
  }
  if (input.status !== undefined && !hasPermission(actor, "workflows.edit_status")) {
    return NextResponse.json({ error: "Forbidden — cannot edit status" }, { status: 403 });
  }
  if (input.internalNotes !== undefined && !hasPermission(actor, "workflows.add_internal_notes")) {
    return NextResponse.json({ error: "Forbidden — cannot add internal notes" }, { status: 403 });
  }
  if (input.customerMessage !== undefined && !hasPermission(actor, "workflows.publish_customer_updates")) {
    return NextResponse.json({ error: "Forbidden — cannot publish customer updates" }, { status: 403 });
  }
  // Renaming a stage is a status-class edit — sales_manager and above.
  if (input.stageName !== undefined && !hasPermission(actor, "workflows.edit_status")) {
    return NextResponse.json({ error: "Forbidden — cannot rename stage" }, { status: 403 });
  }
  if (input.allowOverTarget && !hasPermission(actor, "workflows.override_validation")) {
    return NextResponse.json({ error: "Forbidden — cannot override validation" }, { status: 403 });
  }

  // Workflow existence check for a clean 404 (service throws otherwise).
  const { data: workflow } = await supabaseAdmin
    .from("workflows")
    .select("id, customer_id, assigned_user_id")
    .eq("id", id)
    .maybeSingle();
  if (!workflow) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });

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
