import { NextRequest, NextResponse } from "next/server";
import { getWorkflowActor, hasPermission } from "@/lib/workflows/permissions";
import { assignmentSchema } from "@/lib/workflows/schemas";
import { assignWorkflow } from "@/lib/workflows/service";

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
