import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";
import { upsertPayment } from "@/lib/paymentLedger";

/**
 * Manually flip a marketplace_operator_invoices row to "paid" after admin
 * confirms offline collection (check, ACH, etc.). Also writes a canonical
 * `payments` row via upsertPayment so:
 *
 *   1. Financial Center + reconciliation see the collection
 *   2. Payout sequencing is unlocked — the PP payout can now leave
 *      `awaiting_collection` and push to QB
 *   3. Commission auto-earn fires against the payment (if the source
 *      contract is tied to a sales order)
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const method = typeof body.method === "string" ? body.method.trim().slice(0, 40) : null;
  const reference = typeof body.reference === "string" ? body.reference.trim().slice(0, 120) : null;

  const { data: invoice } = await supabaseAdmin
    .from("marketplace_operator_invoices")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  if (invoice.status === "paid") return NextResponse.json({ ok: true, already: true });

  const nowIso = new Date().toISOString();

  // Ledger write — provider='manual' so it flows through the same
  // commissions + reconciliation pipeline as sales-side manual payments.
  const amountCents = Math.max(0, Math.round(Number(invoice.amount) * 100));
  try {
    await upsertPayment({
      provider: "manual",
      providerPaymentId: `manual:marketplace_operator_invoice:${invoice.id}`,
      buyerEmail: invoice.operator_email || null,
      buyerProfileId: invoice.operator_profile_id || null,
      amountCents,
      method: method || "manual",
      status: "paid",
      paidAt: nowIso,
      manualReference: reference,
      metadata: {
        source: "marketplace_operator_invoice",
        marketplace_invoice_id: invoice.id,
        submission_id: invoice.submission_id,
        contract_id: invoice.contract_id,
        qb_invoice_id: invoice.qb_invoice_id || null,
      },
      createdBy: adminId,
    });
  } catch (e) {
    console.error("[op-invoice.mark-paid] ledger write failed:", e);
    // Non-fatal — we still want the manual ack to succeed so admin doesn't
    // get stuck on a payment they know landed. Reconciliation will surface
    // the miss.
  }

  await supabaseAdmin
    .from("marketplace_operator_invoices")
    .update({
      status: "paid",
      paid_at: nowIso,
      paid_method: method,
      paid_reference: reference,
      paid_by: adminId,
      updated_at: nowIso,
    })
    .eq("id", id);

  // Release the paired payout — if it was awaiting_collection, drop it back
  // to queued so the QB Bill drain worker picks it up (or push it directly
  // right here if you want zero-delay).
  await supabaseAdmin
    .from("marketplace_payouts")
    .update({ status: "queued", updated_at: nowIso })
    .eq("submission_id", invoice.submission_id)
    .eq("status", "awaiting_collection");

  // Trigger the payout QB Bill immediately. Fire-and-forget — errors get
  // surfaced on /admin/marketplace/payouts.
  try {
    const { data: payout } = await supabaseAdmin
      .from("marketplace_payouts")
      .select("id, status")
      .eq("submission_id", invoice.submission_id)
      .maybeSingle();
    if (payout && payout.status === "queued") {
      const { pushPayoutToQb } = await import("@/lib/marketplaceQb");
      pushPayoutToQb(payout.id).catch(() => undefined);
    }
  } catch { /* non-critical */ }

  return NextResponse.json({ ok: true });
}
