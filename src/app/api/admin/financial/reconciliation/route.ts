import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";
import { writeAuditLog } from "@/lib/paymentLedger";

/**
 * GET /api/admin/financial/reconciliation?status=open|resolved|all
 *   List reconciliation exceptions.
 * PATCH /api/admin/financial/reconciliation/[id] is a separate route.
 */

export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "open";

  let query = supabaseAdmin
    .from("payment_reconciliation_exceptions")
    .select("*")
    .order("detected_at", { ascending: false })
    .limit(500);
  if (status === "open") query = query.is("resolved_at", null);
  else if (status === "resolved") query = query.not("resolved_at", "is", null);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

/**
 * Resolve/dismiss an exception. Called from the queue UI.
 */
export async function PATCH(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const action = ["ignored", "reconciled", "refunded", "manual_entry", "other"].includes(body.action)
    ? body.action
    : null;
  if (!action) return NextResponse.json({ error: "invalid action" }, { status: 400 });

  const note = String(body.note || "").trim();

  const now = new Date().toISOString();
  await supabaseAdmin
    .from("payment_reconciliation_exceptions")
    .update({
      resolved_at: now,
      resolved_by: adminId,
      resolution_action: action,
      resolution_note: note || null,
    })
    .eq("id", id);

  await writeAuditLog({
    actorId: adminId,
    action: "reconciliation_exception_resolved",
    entityType: "reconciliation_exception",
    entityId: id,
    metadata: { resolution_action: action, note },
  });

  return NextResponse.json({ ok: true });
}
