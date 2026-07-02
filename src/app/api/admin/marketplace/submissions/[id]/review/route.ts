import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const action = body.action;
  const note = String(body.note || "").trim();

  const statusMap: Record<string, string> = {
    approve: "approved",
    request_changes: "changes_requested",
    reject: "rejected",
  };
  const nextStatus = statusMap[action];
  if (!nextStatus) return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  const now = new Date().toISOString();
  const { data: submission } = await supabaseAdmin
    .from("placement_submissions")
    .select("id, contract_id, admin_status")
    .eq("id", id)
    .maybeSingle();
  if (!submission) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await supabaseAdmin
    .from("placement_submissions")
    .update({
      admin_status: nextStatus,
      admin_reviewer_id: adminId,
      admin_reviewed_at: now,
      admin_review_note: note || null,
      updated_at: now,
    })
    .eq("id", id);

  await supabaseAdmin.from("placement_submission_activity").insert({
    submission_id: id,
    actor_id: adminId,
    activity_type: `admin_${action}`,
    description: `Admin ${action.replace(/_/g, " ")}${note ? `: ${note}` : ""}`,
  });

  // If approved and this is the first approved submission for this contract,
  // increment locations_filled — otherwise leave it alone. (Full slot counting
  // happens on operator accept in phase 2.4.)
  if (action === "approve" && submission.admin_status !== "approved") {
    // no-op for now; operator acceptance in 2.4 owns the counter
  }

  // Notify the right side (Phase 2.6).
  const { notifyOperatorSubmissionReady, notifyPartnerSubmissionReviewed } = await import("@/lib/marketplaceNotifications");
  if (action === "approve") {
    notifyOperatorSubmissionReady(id).catch(() => undefined);
  } else {
    notifyPartnerSubmissionReviewed(id, action as "approve" | "request_changes" | "reject", note || null).catch(() => undefined);
  }

  return NextResponse.json({ ok: true });
}
