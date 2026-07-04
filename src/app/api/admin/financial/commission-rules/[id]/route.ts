import { NextRequest, NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { writeAuditLog } from "@/lib/paymentLedger";

/**
 * PATCH — update rate_bps, hold_days, is_active, notes. Matchers are
 *   immutable — replacing them requires deleting + recreating so the audit
 *   log stays clean.
 * DELETE — hard delete for non-default rules only. Default rule can only be
 *   toggled active/inactive via PATCH.
 */

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data: before } = await supabaseAdmin
    .from("commission_rules")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.rate_bps !== undefined) {
    const n = Number(body.rate_bps);
    if (!Number.isFinite(n) || n < 0 || n > 10000) {
      return NextResponse.json({ error: "rate_bps must be 0-10000." }, { status: 400 });
    }
    updates.rate_bps = n;
  }
  if (body.hold_days !== undefined) {
    const n = Number(body.hold_days);
    if (!Number.isFinite(n) || n < 0 || n > 365) {
      return NextResponse.json({ error: "hold_days must be 0-365." }, { status: 400 });
    }
    updates.hold_days = n;
  }
  if (typeof body.is_active === "boolean") updates.is_active = body.is_active;
  if (body.notes !== undefined) updates.notes = body.notes ? String(body.notes) : null;

  const { data: after, error } = await supabaseAdmin
    .from("commission_rules")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAuditLog({
    actorId: adminId,
    action: "commission_rule_updated",
    entityType: "commission_rule",
    entityId: id,
    before,
    after,
  });

  return NextResponse.json(after);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data: before } = await supabaseAdmin
    .from("commission_rules")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (before.is_default) {
    return NextResponse.json({ error: "Cannot delete the default rule — deactivate or edit instead." }, { status: 400 });
  }

  await supabaseAdmin.from("commission_rules").delete().eq("id", id);

  await writeAuditLog({
    actorId: adminId,
    action: "commission_rule_deleted",
    entityType: "commission_rule",
    entityId: id,
    before,
  });

  return NextResponse.json({ ok: true });
}
