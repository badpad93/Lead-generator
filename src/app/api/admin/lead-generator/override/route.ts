import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

/**
 * POST /api/admin/lead-generator/override
 * Body: { user_id, action: 'grant' | 'revoke' | 'clear', reason?: string }
 *
 * Admin-only Lead Generator entitlement override. Wins over role-based
 * and subscription-derived entitlement (see getLeadGeneratorAccess).
 *
 *   grant  → creates/updates a source=admin_override, status=active row.
 *            User can use LG regardless of role or subscription.
 *   revoke → creates/updates a source=admin_override, status=revoked row.
 *            User is blocked from LG even if they'd otherwise qualify.
 *   clear  → deletes the admin_override row so the resolver falls back
 *            to role-based / subscription logic.
 *
 * Always audit-logged with before/after.
 */
export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const userId = typeof body.user_id === "string" ? body.user_id : "";
  const action = typeof body.action === "string" ? body.action : "";
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 500) : "";

  if (!userId) return NextResponse.json({ error: "user_id required" }, { status: 400 });
  if (!["grant", "revoke", "clear"].includes(action)) {
    return NextResponse.json({ error: "action must be grant, revoke, or clear" }, { status: 400 });
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { data: before } = await supabaseAdmin
    .from("account_entitlements")
    .select("*")
    .eq("user_id", userId)
    .eq("entitlement_key", "lead_generator_access")
    .maybeSingle();

  const nowIso = new Date().toISOString();

  if (action === "clear") {
    // Only clear if the existing row is admin_override; leave role_based /
    // subscription rows untouched.
    if (before?.source === "admin_override") {
      await supabaseAdmin
        .from("account_entitlements")
        .delete()
        .eq("id", before.id);
    }
  } else {
    const newStatus = action === "grant" ? "active" : "revoked";
    await supabaseAdmin
      .from("account_entitlements")
      .upsert({
        user_id: userId,
        entitlement_key: "lead_generator_access",
        source: "admin_override",
        status: newStatus,
        starts_at: nowIso,
        metadata: { reason, actor_id: adminId },
        updated_at: nowIso,
      }, { onConflict: "user_id,entitlement_key" });
  }

  await supabaseAdmin.from("audit_logs").insert({
    actor_id: adminId,
    action: `lead_generator_admin_${action}`,
    entity_type: "account_entitlements",
    entity_id: userId,
    before: before ? { source: before.source, status: before.status } : null,
    after: action === "clear" ? null : { source: "admin_override", status: action === "grant" ? "active" : "revoked" },
    metadata: {
      target_user_email: profile.email,
      target_user_full_name: profile.full_name,
      reason,
    },
  });

  return NextResponse.json({ ok: true });
}
