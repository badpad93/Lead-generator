import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { canOperationallyEditWorkflow, getWorkflowActor } from "@/lib/workflows/permissions";
import { changeDeadlineSchema } from "@/lib/workflows/schemas";
import { changeDeadline } from "@/lib/workflows/service";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getWorkflowActor(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Deadline nudges are an operational edit — elevated roles OR the
  // assignee/collaborator on this specific workflow can change it.
  const { data: workflow } = await supabaseAdmin
    .from("workflows")
    .select("id, customer_id, assigned_user_id")
    .eq("id", id)
    .maybeSingle();
  if (!workflow) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  if (!(await canOperationallyEditWorkflow(actor, workflow))) {
    return NextResponse.json({ error: "Forbidden — you must be assigned to change this workflow's deadline" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = changeDeadlineSchema.safeParse({ ...body, workflowId: id });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.format() }, { status: 400 });
  }

  try {
    const updated = await changeDeadline({ ...parsed.data, changedBy: actor.id });
    return NextResponse.json({ ok: true, workflow: updated });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
}
