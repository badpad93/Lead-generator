import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

/**
 * POST /api/admin/website-requests/[id]/assign
 * Body: { user_id?: string }  — pass null to unassign
 *
 * Records the change on activity so team handoffs are auditable.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const targetId = typeof body.user_id === "string" && body.user_id ? body.user_id : null;

  const { data: existing } = await supabaseAdmin
    .from("website_requests")
    .select("id, assigned_to")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (targetId) {
    const { data: user } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", targetId)
      .maybeSingle();
    if (!user) return NextResponse.json({ error: "Unknown assignee" }, { status: 400 });
  }

  const { data: updated, error } = await supabaseAdmin
    .from("website_requests")
    .update({ assigned_to: targetId, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabaseAdmin.from("website_request_activity").insert({
    request_id: id,
    actor_id: adminId,
    event_type: "assigned",
    visibility: "internal",
    message: targetId ? `Assigned to ${targetId}` : "Unassigned",
    metadata: { previous_assignee: existing.assigned_to, new_assignee: targetId },
  });

  return NextResponse.json({ request: updated });
}
