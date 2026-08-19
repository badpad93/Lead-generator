import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

/**
 * POST /api/admin/contractor-onboarding/[id]/revoke
 *
 * Cancels an in-flight invitation. Sets status='revoked' and stamps
 * the actor + timestamp. Refuses to revoke a completed packet (use
 * the "reopen" flow for revisions instead — that path creates a new
 * revision row and leaves the completed one immutable).
 *
 * Elevated roles only (admin / DOS / market_leader). Sales managers
 * can initiate but cannot revoke — matches the brief's permission
 * matrix.
 */
const ELEVATED_ROLES = new Set(["admin", "director_of_sales", "market_leader"]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!ELEVATED_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Only admin / director / market leader can revoke." }, { status: 403 });
  }

  const { id } = await params;
  const { data: row } = await supabaseAdmin
    .from("contractor_onboarding")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.status === "completed") {
    return NextResponse.json({ error: "Cannot revoke a completed packet." }, { status: 409 });
  }
  if (row.status === "revoked") {
    return NextResponse.json({ ok: true, already: true });
  }

  const nowIso = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("contractor_onboarding")
    .update({ status: "revoked", revoked_at: nowIso, revoked_by: user.id, updated_at: nowIso })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: user.id,
      action: "contractor_onboarding_revoked",
      entity_type: "contractor_onboarding",
      entity_id: id,
    });
  } catch { /* non-fatal */ }

  return NextResponse.json({ ok: true });
}
