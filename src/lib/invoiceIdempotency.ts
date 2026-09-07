/**
 * Signing-time invoice idempotency, as a pure decision over the evidence
 * that an invoice already exists for an order — in preference order
 * (strongest first):
 *
 *   1. financial_spine_invoice_id — the order is linked to a canonical
 *      public.invoices row.
 *   2. a public.invoices row already exists for this order.
 *   3. the order's own invoice_status is already 'sent' / 'paid'.
 *
 * Local invoice_status alone is NOT sufficient: a QuickBooks invoice can
 * exist while invoice_status is stale (Order #108 — QB Invoice 779 sent, but
 * the status write had targeted a non-existent sales_orders.qb_invoice_id
 * column and was swallowed, leaving invoice_status='not_sent'). The free-text
 * activity log is deliberately NOT used as evidence.
 *
 * Kept in its own module (no DB/env imports) so it is unit-testable.
 */
export function invoiceAlreadyExists(evidence: {
  financialSpineInvoiceId?: string | null;
  hasCanonicalInvoiceRow?: boolean;
  invoiceStatus?: string | null;
}): { skip: boolean; reason?: string } {
  if (evidence.financialSpineInvoiceId) {
    return { skip: true, reason: "financial_spine_invoice_linked" };
  }
  if (evidence.hasCanonicalInvoiceRow) {
    return { skip: true, reason: "canonical_invoice_row_exists" };
  }
  if (evidence.invoiceStatus === "sent" || evidence.invoiceStatus === "paid") {
    return { skip: true, reason: "invoice_already_sent" };
  }
  return { skip: false };
}
