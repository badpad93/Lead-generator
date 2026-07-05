import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";
import { writeAuditLog } from "@/lib/paymentLedger";

/**
 * PATCH /api/sales/orders/[id]/commission
 * Body: {
 *   order_rate_pct?: number | null,    // 0-100, null clears
 *   order_note?: string | null,
 *   line_overrides?: Array<{ item_id: string, rate_pct: number | null, note?: string | null }>
 * }
 *
 * Admin-only. Sets/clears commission rate overrides at both the order and
 * per-line level. Existing commission_ledger rows are NOT recomputed —
 * overrides only apply to earn events fired after this call. Use the
 * commissions backfill endpoint if you need to re-run history.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await req.json().catch(() => ({}));

  const { data: before } = await supabaseAdmin
    .from("sales_orders")
    .select("id, commission_rate_bps_override, commission_override_note")
    .eq("id", id)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const orderUpdates: Record<string, unknown> = {};
  const nowIso = new Date().toISOString();

  if ("order_rate_pct" in body) {
    const val = body.order_rate_pct;
    if (val === null || val === "") {
      orderUpdates.commission_rate_bps_override = null;
      orderUpdates.commission_override_note = null;
      orderUpdates.commission_override_by = null;
      orderUpdates.commission_override_at = null;
    } else {
      const pct = Number(val);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        return NextResponse.json({ error: "order_rate_pct must be 0-100." }, { status: 400 });
      }
      orderUpdates.commission_rate_bps_override = Math.round(pct * 100);
      orderUpdates.commission_override_note = body.order_note ? String(body.order_note) : null;
      orderUpdates.commission_override_by = adminId;
      orderUpdates.commission_override_at = nowIso;
    }
    orderUpdates.updated_at = nowIso;
  }

  if (Object.keys(orderUpdates).length > 0) {
    const { error } = await supabaseAdmin
      .from("sales_orders")
      .update(orderUpdates)
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Line-level overrides
  const lineOverrides = Array.isArray(body.line_overrides) ? body.line_overrides : [];
  const lineResults: Array<{ item_id: string; ok: boolean; error?: string }> = [];
  for (const raw of lineOverrides) {
    const itemId = typeof raw.item_id === "string" ? raw.item_id : null;
    if (!itemId) { lineResults.push({ item_id: "?", ok: false, error: "missing item_id" }); continue; }

    // Ensure the line belongs to this order (no cross-order override abuse).
    const { data: item } = await supabaseAdmin
      .from("order_items")
      .select("id, order_id")
      .eq("id", itemId)
      .maybeSingle();
    if (!item || item.order_id !== id) {
      lineResults.push({ item_id: itemId, ok: false, error: "line not on this order" });
      continue;
    }

    const val = raw.rate_pct;
    const patch: Record<string, unknown> = { updated_at: nowIso };
    if (val === null || val === "" || val === undefined) {
      patch.commission_rate_bps_override = null;
      patch.commission_override_note = null;
    } else {
      const pct = Number(val);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        lineResults.push({ item_id: itemId, ok: false, error: "rate_pct must be 0-100" });
        continue;
      }
      patch.commission_rate_bps_override = Math.round(pct * 100);
      patch.commission_override_note = raw.note ? String(raw.note) : null;
    }
    const { error } = await supabaseAdmin
      .from("order_items")
      .update(patch)
      .eq("id", itemId);
    if (error) { lineResults.push({ item_id: itemId, ok: false, error: error.message }); continue; }
    lineResults.push({ item_id: itemId, ok: true });
  }

  await writeAuditLog({
    actorId: adminId,
    action: "commission_override_updated",
    entityType: "sales_order",
    entityId: id,
    before: before as unknown as Record<string, unknown>,
    after: orderUpdates,
    metadata: { line_results: lineResults },
  });

  return NextResponse.json({ ok: true, line_results: lineResults });
}
