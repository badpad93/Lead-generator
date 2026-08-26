import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

/**
 * POST /api/admin/payroll/profiles/[id]/revoke
 *
 * Admin-only. Revokes every active invitation for this profile.
 * The URL(s) become immediately invalid at the token layer.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getSalesUser(req);
  if (!actor || actor.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const { error } = await supabaseAdmin
    .from("payroll_invitations")
    .update({ revoked_at: new Date().toISOString(), revoked_by: actor.id })
    .eq("profile_id", id)
    .is("revoked_at", null)
    .is("used_at", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabaseAdmin.from("payroll_audit_events").insert({
    profile_id: id,
    actor_user_id: actor.id,
    actor_kind: "admin",
    event_type: "invite.revoked",
    description: "All active invitations revoked",
  });

  return NextResponse.json({ ok: true });
}
