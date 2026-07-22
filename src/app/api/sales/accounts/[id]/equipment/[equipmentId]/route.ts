import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

/**
 * PATCH  /api/sales/accounts/[id]/equipment/[equipmentId]
 *   Update editable fields OR flip status to 'removed' with reason.
 * DELETE /api/sales/accounts/[id]/equipment/[equipmentId]
 *   Hard delete — use sparingly; PATCH → status='removed' preserves history.
 */

const EDITABLE = new Set([
  "name",
  "serial_number",
  "model",
  "notes",
  "assigned_at",
  "status",
  "removed_reason",
]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; equipmentId: string }> },
) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, equipmentId } = await params;

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (EDITABLE.has(k)) patch[k] = v;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No editable fields in body" }, { status: 400 });
  }

  // status transition side-effects: when marking removed, stamp
  // removed_at automatically. Reverting to active clears removal
  // fields so the row looks fresh again.
  if (patch.status === "removed") {
    patch.removed_at = new Date().toISOString();
  } else if (patch.status === "active") {
    patch.removed_at = null;
    patch.removed_reason = null;
  }
  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("account_equipment")
    .update(patch)
    .eq("id", equipmentId)
    .eq("account_id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Equipment not found" }, { status: 404 });
  return NextResponse.json({ equipment: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; equipmentId: string }> },
) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, equipmentId } = await params;

  const { error } = await supabaseAdmin
    .from("account_equipment")
    .delete()
    .eq("id", equipmentId)
    .eq("account_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
