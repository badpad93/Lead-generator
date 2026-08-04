import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getWorkflowActor } from "@/lib/workflows/permissions";

/**
 * POST /api/workflows/[id]/assign/accept
 * Body: { assignmentId: uuid }
 *
 * The assignee themselves marks a pending assignment as accepted.
 * Nobody else can accept on their behalf — this is an acknowledgement,
 * not an administrative action. Idempotent: re-accepting is a no-op
 * (returns the existing accepted_at).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getWorkflowActor(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const assignmentId = typeof body?.assignmentId === "string" ? body.assignmentId : null;
  if (!assignmentId) {
    return NextResponse.json({ error: "assignmentId is required" }, { status: 400 });
  }

  const { data: assignment } = await supabaseAdmin
    .from("workflow_assignments")
    .select("id, user_id, workflow_id, active, accepted_at")
    .eq("id", assignmentId)
    .eq("workflow_id", id)
    .maybeSingle();
  if (!assignment) {
    return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  }
  if (!assignment.active) {
    return NextResponse.json({ error: "Assignment is no longer active" }, { status: 409 });
  }
  if (assignment.user_id !== actor.id) {
    return NextResponse.json(
      { error: "Only the assignee can accept this assignment" },
      { status: 403 },
    );
  }

  if (assignment.accepted_at) {
    return NextResponse.json({ ok: true, acceptedAt: assignment.accepted_at, already: true });
  }

  const acceptedAt = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("workflow_assignments")
    .update({ accepted_at: acceptedAt })
    .eq("id", assignmentId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabaseAdmin.from("workflow_events").insert({
    workflow_id: id,
    event_type: "assignment_accepted",
    new_value: { user_id: actor.id, accepted_at: acceptedAt },
    actor_user_id: actor.id,
    actor_type: "staff",
  });

  return NextResponse.json({ ok: true, acceptedAt, already: false });
}
