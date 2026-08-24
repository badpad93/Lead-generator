import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

/**
 * GET /api/admin/team/[id]/credential-history
 *
 * Admin-only. Returns the non-sensitive audit records for every
 * Send-Credentials event fired at this team member. Never returns
 * usernames or passwords — the audit table doesn't store them.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getSalesUser(req);
  if (!actor || actor.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: teamMemberId } = await params;
  if (!teamMemberId) {
    return NextResponse.json({ error: "Team member id required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("team_credential_email_sends")
    .select("id, recipient_email, sent_by_user_id, sent_at, system_names, send_status, error_message")
    .eq("team_member_id", teamMemberId)
    .order("sent_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const senderIds = Array.from(
    new Set((data ?? []).map((r) => r.sent_by_user_id).filter(Boolean)),
  );
  const senderById: Record<string, { full_name: string | null; email: string | null }> = {};
  if (senderIds.length > 0) {
    const { data: senders } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", senderIds);
    for (const s of senders ?? []) {
      senderById[s.id] = { full_name: s.full_name, email: s.email };
    }
  }

  return NextResponse.json({
    history: (data ?? []).map((r) => ({
      id: r.id,
      recipient_email: r.recipient_email,
      sent_by: senderById[r.sent_by_user_id] ?? null,
      sent_at: r.sent_at,
      system_names: r.system_names,
      send_status: r.send_status,
      error_message: r.error_message,
    })),
  });
}
