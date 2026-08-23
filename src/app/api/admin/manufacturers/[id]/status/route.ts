import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

const ADMIN_ROLES = new Set(["admin", "director_of_sales", "market_leader"]);

/**
 * POST /api/admin/manufacturers/[id]/status
 *   Body: { action: "approve" | "reject" | "request_changes" |
 *                     "suspend" | "reactivate" | "terminate",
 *           reason?: string }
 *
 * Enforces valid transitions from the current status. Rejects,
 * suspensions, and terminations require a reason (brief). Every
 * transition is audit-logged.
 */

const TRANSITIONS: Record<string, Set<string>> = {
  submitted: new Set(["approve", "reject", "request_changes"]),
  pending_review: new Set(["approve", "reject", "request_changes"]),
  changes_requested: new Set(["approve", "reject"]),
  approved: new Set(["suspend", "terminate"]),
  active: new Set(["suspend", "terminate"]),
  suspended: new Set(["reactivate", "terminate"]),
};

const REQUIRES_REASON = new Set(["reject", "request_changes", "suspend", "terminate"]);

const NEXT_STATUS_FROM_ACTION = (action: string, from: string): string | null => {
  switch (action) {
    case "approve":
      return "approved";
    case "reject":
      return "rejected";
    case "request_changes":
      return "changes_requested";
    case "suspend":
      return "suspended";
    case "reactivate":
      // Reactivating from suspended goes back to the last durable state.
      // "approved" is the safe default; if the admin needs it live
      // (active), they can flip separately.
      return from === "suspended" ? "approved" : null;
    case "terminate":
      return "terminated";
    default:
      return null;
  }
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSalesUser(req);
  if (!user || !ADMIN_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  const { data: partner } = await supabaseAdmin
    .from("manufacturer_partners")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (!partner) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allowed = TRANSITIONS[partner.status as string];
  if (!allowed || !allowed.has(action)) {
    return NextResponse.json(
      { error: `Cannot ${action} from status ${partner.status}.` },
      { status: 400 },
    );
  }
  if (REQUIRES_REASON.has(action) && !reason) {
    return NextResponse.json(
      { error: "A reason is required for this action." },
      { status: 400 },
    );
  }
  const nextStatus = NEXT_STATUS_FROM_ACTION(action, partner.status as string);
  if (!nextStatus) {
    return NextResponse.json({ error: `Unknown action ${action}.` }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: nextStatus,
    status_reason: reason || null,
    reviewed_by: user.id,
    reviewed_at: nowIso,
    updated_at: nowIso,
  };
  if (nextStatus === "approved") patch.approved_at = nowIso;
  if (nextStatus === "suspended") {
    patch.suspended_at = nowIso;
    patch.suspended_by = user.id;
  }
  if (nextStatus === "terminated") {
    patch.terminated_at = nowIso;
    patch.terminated_by = user.id;
  }

  const { error } = await supabaseAdmin
    .from("manufacturer_partners")
    .update(patch)
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Reuse existing universal audit_logs (105).
  try {
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: user.id,
      action: `manufacturer_${action}`,
      entity_type: "manufacturer_partner",
      entity_id: id,
      before: { status: partner.status },
      after: { status: nextStatus },
      reason: reason || null,
    });
  } catch (auditErr) {
    console.error("[manufacturer/status] audit log failed:", auditErr);
  }

  return NextResponse.json({ status: nextStatus });
}
