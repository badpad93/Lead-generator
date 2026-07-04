import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";
import { writeAuditLog } from "@/lib/paymentLedger";

/**
 * PATCH — rename, reorder, or activate/deactivate a role.
 *   System roles (is_system=true) can't be deactivated — they're referenced
 *   by legacy backfills. Renaming the label is fine either way.
 * DELETE — soft delete (sets is_active=false). System roles reject.
 */

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data: before } = await supabaseAdmin
    .from("attribution_roles")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.label === "string" && body.label.trim()) updates.label = body.label.trim();
  if (typeof body.description === "string") updates.description = body.description.trim() || null;
  if (Number.isFinite(Number(body.sort_order))) updates.sort_order = Math.max(0, Math.min(9999, Number(body.sort_order)));
  if (typeof body.is_active === "boolean") {
    if (!body.is_active && before.is_system) {
      return NextResponse.json({ error: "System roles cannot be deactivated" }, { status: 400 });
    }
    updates.is_active = body.is_active;
  }

  const { data: after, error } = await supabaseAdmin
    .from("attribution_roles")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog({
    actorId: adminId,
    action: "attribution_role_updated",
    entityType: "attribution_role",
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
    .from("attribution_roles")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (before.is_system) return NextResponse.json({ error: "System roles cannot be deleted. Deactivate a custom role instead." }, { status: 400 });

  await supabaseAdmin
    .from("attribution_roles")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id);

  await writeAuditLog({
    actorId: adminId,
    action: "attribution_role_deactivated",
    entityType: "attribution_role",
    entityId: id,
    before,
  });

  return NextResponse.json({ ok: true });
}
