import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";
import { upsertPayment, upsertInvoice, writeAuditLog } from "@/lib/paymentLedger";
import type { PaymentStatus } from "@/lib/paymentLedger";

/**
 * GET /api/admin/financial/payments — admin-only list of payment ledger rows.
 * POST — admin manually records a payment (ACH/wire/cash/check received
 * outside of a provider webhook). Requires proof upload beforehand via the
 * companion /api/admin/financial/payments/proof endpoint; the returned
 * bucket + path are then attached here.
 */

const ALLOWED_METHODS = new Set(["ach", "wire", "cash", "check", "zelle", "venmo", "paypal", "other"]);
const ALLOWED_STATUSES = new Set<PaymentStatus>([
  "pending", "paid", "failed", "cancelled", "written_off",
]);

export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "all";
  const provider = searchParams.get("provider") || "all";
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") || 100)));

  let query = supabaseAdmin
    .from("payments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (status !== "all") query = query.eq("status", status);
  if (provider !== "all") query = query.eq("provider", provider);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "amount (in dollars) is required" }, { status: 400 });
  }
  const method = String(body.method || "").toLowerCase();
  if (!ALLOWED_METHODS.has(method)) {
    return NextResponse.json({ error: `method must be one of ${Array.from(ALLOWED_METHODS).join(", ")}` }, { status: 400 });
  }
  const status = String(body.status || "paid") as PaymentStatus;
  if (!ALLOWED_STATUSES.has(status)) {
    return NextResponse.json({ error: "invalid status for a manual payment" }, { status: 400 });
  }

  const orderId = typeof body.order_id === "string" ? body.order_id : null;
  const agreementId = typeof body.agreement_id === "string" ? body.agreement_id : null;
  const invoiceId = typeof body.invoice_id === "string" ? body.invoice_id : null;
  const buyerEmail = typeof body.buyer_email === "string" ? body.buyer_email : null;

  // Optional: create a shell invoice if none was linked but an order/agreement
  // was provided. Keeps the invoice/payment 1:1 in the ledger.
  let finalInvoiceId = invoiceId;
  if (!finalInvoiceId && (orderId || agreementId)) {
    const shell = await upsertInvoice({
      provider: "manual",
      providerInvoiceId: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      orderId,
      agreementId,
      buyerEmail,
      totalCents: Math.round(amount * 100),
      status: status === "paid" ? "paid" : "open",
      createdBy: adminId,
    });
    finalInvoiceId = shell.id;
  }

  const payment = await upsertPayment({
    provider: "manual",
    providerPaymentId: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    invoiceId: finalInvoiceId || null,
    orderId,
    agreementId,
    buyerEmail,
    amountCents: Math.round(amount * 100),
    method,
    status,
    paidAt: status === "paid" ? new Date().toISOString() : null,
    manualReference: typeof body.reference === "string" ? body.reference.slice(0, 200) : null,
    proofBucket: typeof body.proof_bucket === "string" ? body.proof_bucket : null,
    proofPath: typeof body.proof_path === "string" ? body.proof_path : null,
    proofUrl: typeof body.proof_url === "string" ? body.proof_url : null,
    metadata: {
      recorded_by_admin: true,
      note: typeof body.note === "string" ? body.note.slice(0, 500) : null,
    },
    createdBy: adminId,
  });

  await writeAuditLog({
    actorId: adminId,
    action: "manual_payment_recorded",
    entityType: "payment",
    entityId: payment.id,
    reason: typeof body.reason === "string" ? body.reason : null,
    after: {
      amount,
      method,
      status,
      order_id: orderId,
      agreement_id: agreementId,
      invoice_id: finalInvoiceId,
      reference: body.reference || null,
    },
  });

  return NextResponse.json({ ok: true, payment });
}
