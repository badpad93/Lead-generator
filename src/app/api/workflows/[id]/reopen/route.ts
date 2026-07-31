import { NextRequest, NextResponse } from "next/server";
import { getWorkflowActor, hasPermission } from "@/lib/workflows/permissions";
import { reopenWorkflowSchema } from "@/lib/workflows/schemas";
import { reopenWorkflow } from "@/lib/workflows/service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getWorkflowActor(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(actor, "workflows.reopen")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = reopenWorkflowSchema.safeParse({ ...body, workflowId: id });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.format() }, { status: 400 });
  }

  try {
    const workflow = await reopenWorkflow({ ...parsed.data, reopenedBy: actor.id });
    return NextResponse.json({ ok: true, workflow });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Reopen failed" }, { status: 400 });
  }
}
