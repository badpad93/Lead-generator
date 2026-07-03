import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";
import { recordRefund, writeAuditLog } from "@/lib/paymentLedger";
import { isValidRefundReason } from "@/lib/refundReasons";

/**
 * GET /api/admin/financial/refunds — list refund + chargeback rows
 *   (negative-amount payments) plus their parent payment info.
 * POST — admin records a refund against a parent payment.
 *
 * Refunds recorded here are additive to the ledger:
 *   - Parent payment moves paid → partial_refund / refunded / chargeback
 *   - A negative-amount payment row is created linked via refund_of_payment_id
 *   - Invoice totals are recomputed
 *   - Once Phase 4 lands, affected commission rows will auto-reverse via the
 *     refund_of_payment_id trace.
 */

export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("payments")
    .select("*, parent:refund_of_payment_id(id, amount_cents, buyer_email, provider, method, paid_at)")
    .in("status", ["refunded", "partial_refund", "chargeback"])
    .order("refunded_at", { ascending: false, nullsFirst: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const parentPaymentId = String(body.parent_payment_id || "").trim();
  const amount = Number(body.amount);
  const reasonCode = String(body.reason_code || "").trim();
  const notes = String(body.notes || "").trim();
  const isChargeback = body.is_chargeback === true;

  if (!parentPaymentId) return NextResponse.json({ error: "parent_payment_id is required" }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "amount must be > 0 (in dollars)" }, { status: 400 });
  if (!isValidRefundReason(reasonCode)) return NextResponse.json({ error: "invalid reason_code" }, { status: 400 });

  // Load parent to validate it's refundable and get provider info
  const { data: parent } = await supabaseAdmin
    .from("payments")
    .select("id, provider, status, amount_cents, buyer_email, invoice_id, order_id, agreement_id")
    .eq("id", parentPaymentId)
    .maybeSingle();
  if (!parent) return NextResponse.json({ error: "parent payment not found" }, { status: 404 });
  if (!["paid", "partial_refund"].includes(parent.status)) {
    return NextResponse.json({ error: `parent payment status is ${parent.status} — must be paid or partial_refund to record a refund` }, { status: 400 });
  }
  if (Math.round(amount * 100) > Number(parent.amount_cents)) {
    return NextResponse.json({ error: "refund amount exceeds parent payment amount" }, { status: 400 });
  }

  const refund = await recordRefund({
    parentPaymentId: parent.id,
    provider: parent.provider as "stripe" | "quickbooks" | "paypal" | "manual",
    providerRefundId: typeof body.provider_refund_id === "string" ? body.provider_refund_id : null,
    amountCents: Math.round(amount * 100),
    reason: notes ? `${reasonCode}: ${notes}` : reasonCode,
    isChargeback,
    createdBy: adminId,
  });

  await writeAuditLog({
    actorId: adminId,
    action: isChargeback ? "chargeback_recorded" : "refund_recorded",
    entityType: "payment",
    entityId: parent.id,
    reason: reasonCode,
    metadata: {
      amount,
      is_chargeback: isChargeback,
      reason_code: reasonCode,
      notes,
      refund_payment_id: refund?.id,
      provider_refund_id: body.provider_refund_id || null,
    },
  });

  return NextResponse.json({ ok: true, refund });
}
