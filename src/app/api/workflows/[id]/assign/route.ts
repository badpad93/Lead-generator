import { NextRequest, NextResponse } from "next/server";
import { getWorkflowActor, hasPermission } from "@/lib/workflows/permissions";
import { assignmentSchema } from "@/lib/workflows/schemas";
import { assignWorkflow, unassignWorkflow } from "@/lib/workflows/service";

/**
 * POST /api/workflows/[id]/assign
 *
 * Assign a user to the workflow (primary owner or collaborator). Bumps
 * the primary assignee when role='primary_owner' or makePrimary=true.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getWorkflowActor(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(actor, "workflows.assign")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = assignmentSchema.safeParse({ ...body, workflowId: id });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.format() }, { status: 400 });
  }

  try {
    await assignWorkflow({ ...parsed.data, assignedBy: actor.id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Assignment failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/**
 * DELETE /api/workflows/[id]/assign?assignmentId=<uuid>
 *
 * Remove a single assignment (soft-delete). Query-param rather than
 * nested route because the assignment id doesn't need its own URL
 * hierarchy — the collection lives inside the workflow.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getWorkflowActor(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(actor, "workflows.assign")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const assignmentId = new URL(req.url).searchParams.get("assignmentId");
  if (!assignmentId) {
    return NextResponse.json({ error: "assignmentId query param is required" }, { status: 400 });
  }

  try {
    const result = await unassignWorkflow({
      workflowId: id,
      assignmentId,
      removedBy: actor.id,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unassign failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
