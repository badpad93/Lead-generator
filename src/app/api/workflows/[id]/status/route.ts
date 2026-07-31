import { NextRequest, NextResponse } from "next/server";
import { getWorkflowActor, hasPermission } from "@/lib/workflows/permissions";
import { setOverallStatusSchema } from "@/lib/workflows/schemas";
import { setOverallStatus } from "@/lib/workflows/service";

/**
 * PATCH /api/workflows/[id]/status
 *
 * Manual override of overall_status — used to move a workflow into
 * on_hold, at_risk, or waiting_on_customer/vendor. Requires
 * edit_status. Automatic status derivations (completed / overdue /
 * in_progress) come from the rollup logic in the service, not here.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getWorkflowActor(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(actor, "workflows.edit_status")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = setOverallStatusSchema.safeParse({ ...body, workflowId: id });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.format() }, { status: 400 });
  }

  try {
    const workflow = await setOverallStatus({ ...parsed.data, changedBy: actor.id });
    return NextResponse.json({ ok: true, workflow });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
}
