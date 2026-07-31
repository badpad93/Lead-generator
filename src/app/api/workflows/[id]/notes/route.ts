import { NextRequest, NextResponse } from "next/server";
import { getWorkflowActor, hasPermission } from "@/lib/workflows/permissions";
import { addNoteSchema } from "@/lib/workflows/schemas";
import { addNote } from "@/lib/workflows/service";

/**
 * POST /api/workflows/[id]/notes
 *
 * Add a note to the workflow. Visibility=internal requires
 * add_internal_notes; visibility=customer requires
 * publish_customer_updates.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getWorkflowActor(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = addNoteSchema.safeParse({ ...body, workflowId: id });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.format() }, { status: 400 });
  }

  const input = parsed.data;
  const needsPermission: "workflows.add_internal_notes" | "workflows.publish_customer_updates" =
    input.visibility === "internal" ? "workflows.add_internal_notes" : "workflows.publish_customer_updates";
  if (!hasPermission(actor, needsPermission)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const note = await addNote({ ...input, authorUserId: actor.id });
    return NextResponse.json({ ok: true, note });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
}
