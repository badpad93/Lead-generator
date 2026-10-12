/**
 * Provider-specific ingest — reads a provider event and writes the canonical
 * ledger rows (invoices, payments, allocations) via paymentLedger.
 *
 * Each ingest function is non-fatal for the caller: if it throws or logs a
 * failure, the pre-existing downstream handlers still run. As we migrate more
 * business logic onto the ledger, downstream handlers can be simplified /
 * removed, but for Phase 1 both flows coexist.
 */

import { supabaseAdmin } from "./supabaseAdmin";
import { getConnection, getAccountingApiBase } from "./quickbooks";
import { upsertInvoice, upsertPayment } from "./paymentLedger";

function toCents(amount: number | string | null | undefined): number {
  if (amount == null) return 0;
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

// ─── QuickBooks ──────────────────────────────────────────────────────────

/**
 * Fetches the QB Payment record, walks the LinkedTxn list to find the parent
 * Invoice, and writes ledger rows.
 */
export async function ingestQbPaymentEvent(
  paymentId: string,
  realmId: string,
  eventRowId: string | null,
): Promise<void> {
  const conn = await getConnection();
  if (conn.realm_id !== realmId) return;

  const base = getAccountingApiBase();

  const res = await fetch(`${base}/v3/company/${realmId}/payment/${paymentId}`, {
    headers: {
      Authorization: `Bearer ${conn.access_token}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) return;
  const data = await res.json();
  const payment = data.Payment;
  if (!payment) return;

  const amountCents = toCents(payment.TotalAmt);
  const paidAt = payment.TxnDate ? new Date(payment.TxnDate).toISOString() : new Date().toISOString();

  // Walk linked invoices — most QB Payments carry a single invoice.
  const linkedInvoiceIds: string[] = [];
  for (const line of payment.Line || []) {
    for (const txn of line.LinkedTxn || []) {
      if (txn.TxnType === "Invoice") linkedInvoiceIds.push(String(txn.TxnId));
    }
  }

  const primaryInvoiceQbId = linkedInvoiceIds[0] || null;
  let invoiceRowId: string | null = null;

  if (primaryInvoiceQbId) {
    // If we already know this QB invoice, use it. Otherwise create a shell.
    const { data: existingInvoice } = await supabaseAdmin
      .from("invoices")
      .select("id, total_cents")
      .eq("provider", "quickbooks")
      .eq("provider_invoice_id", primaryInvoiceQbId)
      .maybeSingle();

    if (existingInvoice) {
      invoiceRowId = existingInvoice.id;
    } else {
      const created = await upsertInvoice({
        provider: "quickbooks",
        providerInvoiceId: primaryInvoiceQbId,
        buyerEmail: payment.CustomerRef?.name || null,
        subtotalCents: amountCents,
        totalCents: amountCents,
        status: "paid",
      });
      invoiceRowId = created.id;
    }
  }

  await upsertPayment({
    provider: "quickbooks",
    providerPaymentId: String(payment.Id),
    eventId: eventRowId,
    invoiceId: invoiceRowId,
    amountCents,
    method: payment.PaymentMethodRef?.name?.toLowerCase() || "unknown",
    status: "paid",
    paidAt,
  });
}
